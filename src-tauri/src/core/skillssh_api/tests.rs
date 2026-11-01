use super::{parse_embedded_skill_objects, parse_next_data};

#[test]
fn parses_legacy_next_data_payload() {
    let html = r#"
        <html>
          <script id="__NEXT_DATA__" type="application/json">
            {"props":{"pageProps":{"initialSkills":[{"source":"antfu/skills","skillId":"vite","name":"vite","installs":152}]}}}
          </script>
        </html>
        "#;

    let skills = parse_next_data(html).expect("legacy payload should parse");
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].id, "antfu/skills/vite");
}

#[test]
fn parses_current_rsc_payload() {
    let html = r#"
        <script>self.__next_f.push([1,"...\n[{\"source\":\"anthropics/skills\",\"skillId\":\"template-skill\",\"name\":\"template-skill\",\"installs\":238},{\"source\":\"vercel/ai\",\"skillId\":\"ai-sdk\",\"name\":\"ai-sdk\",\"installs\":265}]...\n"])</script>
        "#;

    let skills = parse_embedded_skill_objects(html).expect("rsc payload should parse");
    assert_eq!(skills.len(), 2);
    assert_eq!(skills[0].id, "anthropics/skills/template-skill");
    assert_eq!(skills[1].id, "vercel/ai/ai-sdk");
}

#[test]
fn parses_legacy_embedded_payload() {
    let html = r#"
        {"source":"openai/skills","skill_id":"playwright","name":"playwright","installs":2}
        "#;

    let skills = parse_embedded_skill_objects(html).expect("legacy fallback should parse");
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].id, "openai/skills/playwright");
}

#[test]
fn filters_out_non_github_sources() {
    let html = r#"
        <html>
          <script id="__NEXT_DATA__" type="application/json">
            {"props":{"pageProps":{"initialSkills":[
              {"source":"open.feishu.cn","skillId":"some-skill","name":"Some Skill","installs":10},
              {"source":"anthropics/skills","skillId":"good-skill","name":"Good Skill","installs":50}
            ]}}}
          </script>
        </html>
        "#;

    let skills = parse_next_data(html).expect("should parse");
    assert_eq!(skills.len(), 1);
    assert_eq!(skills[0].source, "anthropics/skills");
}
