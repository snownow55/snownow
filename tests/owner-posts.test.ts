import { test } from "node:test";
import assert from "node:assert/strict";
import { validEdit } from "../lib/post-edit.ts";
const fields={area:"中腹",snow_type:"パウダー",snowfall:"ほぼ無し",roughness:"きれい",crowd:"普通",comment:"編集"};
test("edits accept exactly the six condition fields; immutable properties cannot be smuggled in",()=>{
 assert.equal(validEdit(fields),true);
 for(const key of ['resort','created_at','user_id','updated_at','condition']) assert.equal(validEdit({...fields,[key]:'tampered'}),false);
 assert.equal(validEdit({...fields,comment:'😀'.repeat(501)}),false);
 assert.equal(validEdit({...fields,crowd:'invalid'}),false);
 assert.equal(validEdit({...fields,comment:null}),false);
});
