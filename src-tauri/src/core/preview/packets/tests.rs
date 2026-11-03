use super::*;
#[test]
fn delivers_readable_context_and_removes_only_owned_packets_on_clear() {
    let root = tempfile::tempdir().unwrap();
    let packets = Packets::new(root.path().into());
    let packet = packets.prepare("Change the heading", &[]).unwrap();
    assert_eq!(
        std::fs::read_to_string(&packet.context_path).unwrap(),
        "Change the heading"
    );
    let unrelated = root.path().join("keep.txt");
    std::fs::write(&unrelated, "keep").unwrap();
    packets.clear();
    assert!(!std::path::Path::new(&packet.context_path).exists());
    assert!(unrelated.exists());
}
