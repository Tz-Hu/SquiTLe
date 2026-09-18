import test from "node:test";
import assert from "node:assert/strict";
import {obstaclesNearRoute} from "../lib/connection-routing.ts";

test("connection routing keeps only obstacles near the endpoint corridor",()=>{
  const near={left:40,right:60,top:10,bottom:30};
  const marginOnly={left:105,right:115,top:35,bottom:45};
  const farRight={left:200,right:220,top:10,bottom:30};
  const farBelow={left:40,right:60,top:100,bottom:120};
  assert.deepEqual(
    obstaclesNearRoute({x:0,y:0},{x:100,y:20},[near,marginOnly,farRight,farBelow],20),
    [near,marginOnly],
  );
});
