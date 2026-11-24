import test from "node:test";import assert from "node:assert/strict";
import {validSafetyInput} from "../lib/content-safety.ts";
test("content safety accepts only bounded post IDs, reviewed reasons and exact request shape",()=>{
 assert.equal(validSafetyInput({post_id:1,action:"block"}),true);assert.equal(validSafetyInput({post_id:1,action:"report",reason:"abuse"}),true);
 for(const v of [null,{post_id:0,action:"block"},{post_id:1,action:"report",reason:"random"},{post_id:1,action:"block",user_id:"other"}])assert.equal(validSafetyInput(v),false);
});
