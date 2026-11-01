use super::*;

#[test]
fn register_returns_false_token() {
    let registry = InstallCancelRegistry::new();
    let token = registry.register("op-1");
    assert!(!token.load(Ordering::SeqCst));
}

#[test]
fn cancel_sets_token_to_true() {
    let registry = InstallCancelRegistry::new();
    let token = registry.register("op-1");
    assert!(registry.cancel("op-1"));
    assert!(token.load(Ordering::SeqCst));
}

#[test]
fn cancel_unknown_key_returns_false() {
    let registry = InstallCancelRegistry::new();
    assert!(!registry.cancel("nonexistent"));
}

#[test]
fn remove_cleans_up_token() {
    let registry = InstallCancelRegistry::new();
    registry.register("op-1");
    registry.remove("op-1");
    assert!(!registry.cancel("op-1"));
}

#[test]
fn multiple_operations_independent() {
    let registry = InstallCancelRegistry::new();
    let t1 = registry.register("op-1");
    let t2 = registry.register("op-2");

    registry.cancel("op-1");
    assert!(t1.load(Ordering::SeqCst));
    assert!(!t2.load(Ordering::SeqCst));
}

#[test]
fn register_same_key_replaces_token() {
    let registry = InstallCancelRegistry::new();
    let old = registry.register("op-1");
    let new = registry.register("op-1");

    // Cancelling affects the new token
    registry.cancel("op-1");
    assert!(new.load(Ordering::SeqCst));
    // Old token is no longer tracked (but its Arc still exists)
    assert!(!old.load(Ordering::SeqCst));
}
