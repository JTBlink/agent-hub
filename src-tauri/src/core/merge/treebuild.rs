//! Recursive tree construction (design §5): apply a set of path-addressed
//! edits to a base tree, rebuilding the ancestor chain bottom-up with
//! per-level `TreeBuilder`s. `TreeUpdateBuilder` is deliberately not used —
//! its handling of remove-then-upsert on one path and of blob↔tree type
//! changes is incomplete; type changes are handled explicitly here by
//! removing the old entry before inserting the new one.
//!
//! Callers express "replace whatever is at this path" by inserting removes
//! first and letting puts overwrite them in the flat edit map. A nested edit
//! below a removed path builds that directory from scratch (the removed
//! subtree's former siblings do not leak through).

use anyhow::{bail, Context, Result};
use git2::{ObjectType, Oid, Repository, Tree};
use std::collections::BTreeMap;

pub const FILEMODE_TREE: i32 = 0o040000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TreeEdit {
    /// Put a blob at this path (file mode from the source entry).
    PutBlob { oid: Oid, mode: i32 },
    /// Attach a whole subtree at this path.
    PutTree { oid: Oid },
    /// Remove whatever is at this path (blob or subtree).
    Remove,
}

struct DirNode {
    /// When true, ignore the base tree at this level: the old entry was
    /// removed, so the directory is rebuilt only from the nested edits.
    fresh: bool,
    children: BTreeMap<String, Node>,
}

enum Node {
    Leaf(TreeEdit),
    Dir(DirNode),
}

/// Apply `edits` (repo-relative slash paths → edit) on top of `base`,
/// returning the OID of the new root tree. Directories that end up empty are
/// pruned (git does not represent empty trees in a commit).
pub fn apply_tree_edits(
    repo: &Repository,
    base: Option<&Tree>,
    edits: &BTreeMap<String, TreeEdit>,
) -> Result<Oid> {
    let mut root: BTreeMap<String, Node> = BTreeMap::new();
    for (path, edit) in edits {
        insert_edit(&mut root, path, *edit)
            .with_context(|| format!("conflicting tree edits at {path}"))?;
    }
    match build_level(repo, base, &root)? {
        Some(oid) => Ok(oid),
        // A fully-emptied root is still a valid (empty) tree.
        None => Ok(repo.treebuilder(None)?.write()?),
    }
}

fn insert_edit(level: &mut BTreeMap<String, Node>, path: &str, edit: TreeEdit) -> Result<()> {
    let (head, rest) = match path.split_once('/') {
        Some((h, r)) => (h, Some(r)),
        None => (path, None),
    };
    if head.is_empty() {
        bail!("empty path component");
    }
    match rest {
        None => match level.get_mut(head) {
            None => {
                level.insert(head.to_string(), Node::Leaf(edit));
                Ok(())
            }
            Some(Node::Dir(dir)) if edit == TreeEdit::Remove => {
                // Remove of a directory that already has nested puts: rebuild
                // it from scratch so former siblings do not leak through.
                dir.fresh = true;
                Ok(())
            }
            Some(_) => bail!("duplicate edit for {head}"),
        },
        Some(rest) => {
            let node = level.entry(head.to_string()).or_insert_with(|| {
                Node::Dir(DirNode {
                    fresh: false,
                    children: BTreeMap::new(),
                })
            });
            if let Node::Leaf(TreeEdit::Remove) = node {
                // The whole old entry goes away; nested edits build the new
                // directory from scratch.
                *node = Node::Dir(DirNode {
                    fresh: true,
                    children: BTreeMap::new(),
                });
            }
            match node {
                Node::Dir(dir) => insert_edit(&mut dir.children, rest, edit),
                Node::Leaf(_) => bail!("edit below a leaf edit at {head}"),
            }
        }
    }
}

fn build_level(
    repo: &Repository,
    base: Option<&Tree>,
    nodes: &BTreeMap<String, Node>,
) -> Result<Option<Oid>> {
    let mut builder = repo.treebuilder(base)?;
    for (name, node) in nodes {
        let existing_kind = builder.get(name)?.and_then(|e| e.kind());
        match node {
            Node::Leaf(TreeEdit::Remove) => {
                if existing_kind.is_some() {
                    builder.remove(name)?;
                }
            }
            Node::Leaf(TreeEdit::PutBlob { oid, mode }) => {
                if existing_kind == Some(ObjectType::Tree) {
                    builder.remove(name)?; // tree → blob type change
                }
                builder.insert(name, *oid, *mode)?;
            }
            Node::Leaf(TreeEdit::PutTree { oid }) => {
                if existing_kind == Some(ObjectType::Blob) {
                    builder.remove(name)?; // blob → tree type change
                }
                builder.insert(name, *oid, FILEMODE_TREE)?;
            }
            Node::Dir(dir) => {
                let existing = builder.get(name)?.map(|e| (e.kind(), e.id()));
                let child_base = match existing {
                    _ if dir.fresh => None,
                    Some((Some(ObjectType::Tree), id)) => Some(repo.find_tree(id)?),
                    Some(_) => {
                        // A blob where the plan needs a directory: explicit
                        // type change — drop the blob, build from empty.
                        builder.remove(name)?;
                        None
                    }
                    None => None,
                };
                match build_level(repo, child_base.as_ref(), &dir.children)? {
                    Some(oid) => {
                        if dir.fresh && existing_kind == Some(ObjectType::Blob) {
                            builder.remove(name)?;
                        }
                        builder.insert(name, oid, FILEMODE_TREE)?;
                    }
                    None => {
                        if builder.get(name)?.is_some() {
                            builder.remove(name)?;
                        }
                    }
                }
            }
        }
    }
    let oid = builder.write()?;
    if repo.find_tree(oid)?.is_empty() {
        return Ok(None);
    }
    Ok(Some(oid))
}

#[cfg(test)]
mod tests;
