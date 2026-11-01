use super::*;

const MINIMUM: WindowSize = WindowSize {
    width: 1100.0,
    height: 640.0,
};

#[test]
fn preserves_a_saved_size_on_a_large_monitor() {
    let saved = WindowSize {
        width: 1420.0,
        height: 920.0,
    };
    assert_eq!(
        fit_size(
            saved,
            MINIMUM,
            WindowSize {
                width: 2560.0,
                height: 1400.0
            }
        ),
        saved
    );
}

#[test]
fn fits_a_large_default_or_saved_window_to_a_smaller_screen() {
    assert_eq!(
        fit_size(
            WindowSize {
                width: 1600.0,
                height: 1000.0
            },
            MINIMUM,
            WindowSize {
                width: 1280.0,
                height: 760.0
            }
        ),
        WindowSize {
            width: 1280.0,
            height: 760.0
        }
    );
}

#[test]
fn allows_a_screen_smaller_than_the_normal_minimum() {
    assert_eq!(
        fit_size(
            MINIMUM,
            MINIMUM,
            WindowSize {
                width: 1024.0,
                height: 600.0
            }
        ),
        WindowSize {
            width: 1024.0,
            height: 600.0
        }
    );
}

#[test]
fn default_uses_the_entire_screen_work_area() {
    let screen = WindowSize {
        width: 2560.0,
        height: 1415.0,
    };
    assert_eq!(fit_size(screen, MINIMUM, screen), screen);
    let config: serde_json::Value =
        serde_json::from_str(include_str!("../../tauri.conf.json")).unwrap();
    assert_eq!(config["app"]["windows"][0]["maximized"], true);
}

#[test]
fn rejects_invalid_saved_sizes() {
    for width in [0.0, -1.0, f64::NAN, f64::INFINITY] {
        assert!(!WindowSize {
            width,
            height: 800.0
        }
        .is_valid());
    }
}
