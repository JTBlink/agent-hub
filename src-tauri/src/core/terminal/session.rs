use super::{Sink, TerminalEvent, TerminalSession, TerminalSpec};
use anyhow::{bail, Context, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use portable_pty::{ChildKiller, MasterPty, PtySize};
use std::{
    collections::VecDeque,
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
        Arc, Condvar, Mutex,
    },
    thread,
};

const OUTPUT_CHUNK: usize = 16 * 1024;
const OUTPUT_BUDGET: usize = 256 * 1024;
#[derive(Default)]
struct Flow {
    frames: VecDeque<(u64, usize)>,
    sent: u64,
    bytes: usize,
    closed: bool,
}

pub(super) struct Session {
    pub owner: String,
    snapshot: TerminalSession,
    shell: Mutex<super::shell::ShellState>,
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    input: Mutex<Option<SyncSender<Vec<u8>>>>,
    flow: Mutex<Flow>,
    wake: Condvar,
    exited: AtomicBool,
    #[cfg(unix)]
    pid: Option<u32>,
}

impl Session {
    pub fn spawn(owner: &str, mut spec: TerminalSpec, sink: Sink) -> Result<Arc<Self>> {
        let size = spec.size.pty()?;
        if !spec.cwd.is_dir() {
            bail!("Project directory is unavailable");
        }
        spec.command.cwd(&spec.cwd);
        let pair = portable_pty::native_pty_system().openpty(size)?;
        let mut reader = pair.master.try_clone_reader()?;
        let writer = pair.master.take_writer()?;
        let mut child = pair
            .slave
            .spawn_command(spec.command)
            .context("Cannot start project Shell")?;
        drop(pair.slave);
        let (sender, receiver) = mpsc::sync_channel::<Vec<u8>>(64);
        let session = Arc::new(Self {
            owner: owner.into(),
            shell: Mutex::new(super::shell::ShellState::new(spec.integration)),
            snapshot: TerminalSession {
                id: uuid::Uuid::new_v4().to_string(),
                project_id: spec.project_id,
                cwd: spec.cwd.to_string_lossy().into(),
                exited: false,
            },
            master: Mutex::new(Some(pair.master)),
            killer: Mutex::new(child.clone_killer()),
            #[cfg(unix)]
            pid: child.process_id(),
            input: Mutex::new(Some(sender)),
            flow: Mutex::new(Flow::default()),
            wake: Condvar::new(),
            exited: AtomicBool::new(false),
        });
        let input_session = session.clone();
        let input_sink = sink.clone();
        thread::spawn(move || {
            let mut writer = writer;
            while let Ok(bytes) = receiver.recv() {
                if input_session.is_closed() {
                    break;
                }
                if let Err(error) = writer.write_all(&bytes).and_then(|_| writer.flush()) {
                    input_sink(TerminalEvent::Error {
                        message: error.to_string(),
                    });
                    input_session.close();
                    break;
                }
            }
        });
        let (done_tx, done_rx) = mpsc::channel();
        let wait_session = session.clone();
        thread::spawn(move || {
            let result = child.wait().map(|status| status.exit_code());
            wait_session.exited.store(true, Ordering::Release);
            wait_session
                .input
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .take();
            let _ = done_tx.send(result);
        });
        let output_session = session.clone();
        thread::spawn(move || {
            let mut buffer = [0u8; OUTPUT_CHUNK];
            loop {
                if !output_session.wait_for_capacity() {
                    #[cfg(windows)]
                    let _ = std::io::copy(&mut reader, &mut std::io::sink());
                    return;
                }
                match reader.read(&mut buffer) {
                    Ok(0) => break,
                    Ok(count) => {
                        output_session
                            .shell
                            .lock()
                            .unwrap_or_else(|e| e.into_inner())
                            .observe(&buffer[..count]);
                        let seq = output_session.record_frame(count);
                        if !sink(TerminalEvent::Output {
                            seq,
                            data: STANDARD.encode(&buffer[..count]),
                        }) {
                            #[cfg(windows)]
                            {
                                // ConPTY < Windows 11 24H2 must be drained while
                                // ClosePseudoConsole runs on another thread.
                                let closing = output_session.clone();
                                thread::spawn(move || closing.close());
                                let _ = std::io::copy(&mut reader, &mut std::io::sink());
                            }
                            #[cfg(not(windows))]
                            {
                                drop(reader);
                                output_session.close();
                            }
                            return;
                        }
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(error) => {
                        // Unix PTYs may report EIO after the last slave closes.
                        if error.raw_os_error() != Some(5) && !output_session.is_closed() {
                            sink(TerminalEvent::Error {
                                message: error.to_string(),
                            });
                        }
                        break;
                    }
                }
            }
            drop(reader);
            if let Ok(result) = done_rx.recv() {
                match result {
                    Ok(code) => {
                        sink(TerminalEvent::Exit { code });
                    }
                    Err(error) => {
                        sink(TerminalEvent::Error {
                            message: error.to_string(),
                        });
                    }
                }
            }
        });
        Ok(session)
    }
    pub fn snapshot(&self) -> TerminalSession {
        let mut value = self.snapshot.clone();
        value.exited = self.exited.load(Ordering::Acquire);
        value
    }
    fn is_closed(&self) -> bool {
        self.flow.lock().unwrap_or_else(|e| e.into_inner()).closed
    }
    fn wait_for_capacity(&self) -> bool {
        let mut flow = self.flow.lock().unwrap_or_else(|e| e.into_inner());
        while !flow.closed && flow.bytes + OUTPUT_CHUNK > OUTPUT_BUDGET {
            flow = self.wake.wait(flow).unwrap_or_else(|e| e.into_inner());
        }
        !flow.closed
    }
    fn record_frame(&self, bytes: usize) -> u64 {
        let mut flow = self.flow.lock().unwrap_or_else(|e| e.into_inner());
        flow.sent += 1;
        let seq = flow.sent;
        flow.frames.push_back((seq, bytes));
        flow.bytes += bytes;
        seq
    }
    pub fn ack(&self, seq: u64) -> Result<()> {
        let mut flow = self.flow.lock().unwrap_or_else(|e| e.into_inner());
        if seq > flow.sent {
            bail!("Invalid terminal acknowledgement");
        }
        while flow
            .frames
            .front()
            .is_some_and(|(number, _)| *number <= seq)
        {
            if let Some((_, bytes)) = flow.frames.pop_front() {
                flow.bytes -= bytes;
            }
        }
        self.wake.notify_all();
        Ok(())
    }
    pub fn write(&self, bytes: Vec<u8>) -> Result<()> {
        let mut shell = self.shell.lock().unwrap_or_else(|e| e.into_inner());
        #[cfg(unix)]
        let foreground_program = shell.state.herdr_active
            && self
                .master
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .as_ref()
                .and_then(|pty| pty.process_group_leader())
                .map(|pid| pid as u32)
                != self.pid;
        #[cfg(not(unix))]
        let foreground_program = false;
        shell.input(&bytes, foreground_program);
        self.enqueue(bytes)
    }
    fn enqueue(&self, bytes: Vec<u8>) -> Result<()> {
        if bytes.len() > 64 * 1024 {
            bail!("Terminal input exceeds 64 KiB per request");
        }
        if self.exited.load(Ordering::Acquire) || self.is_closed() {
            bail!("Terminal has exited");
        }
        self.input
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .context("Terminal input is closed")?
            .try_send(bytes)
            .context("Terminal input queue is full or closed")
    }
    pub fn launch_state(&self) -> super::LaunchState {
        self.shell
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .state
            .clone()
    }
    pub fn launch_herdr(&self, executable: &std::path::Path, revision: u64) -> Result<bool> {
        let mut shell = self.shell.lock().unwrap_or_else(|e| e.into_inner());
        if shell.state.herdr_active {
            return Ok(false);
        }
        if !shell.state.ready
            || shell.state.revision != revision
            || self.exited.load(Ordering::Acquire)
        {
            bail!("Shell is busy or its input has changed; open an empty terminal or retry at a fresh prompt");
        }
        #[cfg(unix)]
        {
            let master = self.master.lock().unwrap_or_else(|e| e.into_inner());
            if master
                .as_ref()
                .and_then(|pty| pty.process_group_leader())
                .map(|pid| pid as u32)
                != self.pid
            {
                bail!("Another program owns the terminal foreground");
            }
        }
        let command = shell.command(executable)?;
        shell.input(command.as_bytes(), false);
        self.enqueue(command.into_bytes())?;
        shell.state.herdr_active = true;
        Ok(true)
    }
    pub fn resize(&self, size: PtySize) -> Result<()> {
        self.master
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .as_ref()
            .context("Terminal is closed")?
            .resize(size)
    }
    pub fn close(&self) {
        {
            let mut flow = self.flow.lock().unwrap_or_else(|e| e.into_inner());
            if flow.closed {
                return;
            }
            flow.closed = true;
            self.wake.notify_all();
        }
        self.input.lock().unwrap_or_else(|e| e.into_inner()).take();
        let mut master = self.master.lock().unwrap_or_else(|e| e.into_inner());
        #[cfg(unix)]
        if let (Some(pid), Some(pty)) = (self.pid, master.as_ref()) {
            super::process::terminate_owned_session(pty.as_ref(), pid);
        }
        // Windows portable-pty drops its owned ConPTY below, terminating its
        // attached console clients. A detached daemon is outside that console.
        let _ = self.killer.lock().unwrap_or_else(|e| e.into_inner()).kill();
        master.take();
    }
}
