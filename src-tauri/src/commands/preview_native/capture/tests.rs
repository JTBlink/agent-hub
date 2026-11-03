use super::*;
#[test]
fn bounds_are_finite_bounded_and_distinguish_viewport_from_document() {
    let info = json!({"scrollX":0,"scrollY":80,"width":800,"height":600,"documentWidth":800,"documentHeight":2000});
    assert_eq!(area(&info, false, None).unwrap().y, 80);
    assert_eq!(area(&info, true, None).unwrap().height, 2000);
    for clip in [
        json!({"x":0,"y":0,"width":20001,"height":1}),
        json!({"x":0,"y":0,"width":10000,"height":10000}),
        json!({"x":0,"y":0,"width":0,"height":1}),
    ] {
        assert!(area(&info, false, Some(&clip)).is_err());
    }
}
