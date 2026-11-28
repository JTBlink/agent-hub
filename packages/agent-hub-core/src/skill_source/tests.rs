use super::*;

struct Catalog(&'static str);

impl SkillSource for Catalog {
    fn search(&self, _: &str, _: Option<&str>) -> Result<SkillSearchPage> {
        Ok(SkillSearchPage {
            skills: vec![SkillSummary {
                id: self.0.into(),
                name: self.0.into(),
                description: None,
            }],
            next_cursor: None,
        })
    }

    fn versions(&self, _: &str) -> Result<Vec<SkillVersion>> {
        unreachable!()
    }

    fn download(&self, _: &str, _: &str) -> Result<Box<dyn Read + Send>> {
        unreachable!()
    }
}

#[test]
fn registers_catalogs_without_replacing_existing_identifiers() {
    let registry = SkillSourceRegistry::default();
    assert!(registry.get("workflows").unwrap().is_none());
    assert!(registry
        .register("https://example.invalid", Catalog("unexpected"))
        .is_err());
    registry.register("workflows", Catalog("original")).unwrap();
    assert!(registry
        .register("workflows", Catalog("replacement"))
        .is_err());
    let catalog = registry.get("workflows").unwrap().unwrap();
    assert_eq!(
        catalog.search("example", None).unwrap().skills[0].id,
        "original",
    );
}
