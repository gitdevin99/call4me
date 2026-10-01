import test from 'node:test';
import assert from 'node:assert/strict';
import {appViewportSize} from '../src/viewport.ts';

test('a moving visual viewport does not expose empty space below the PWA',()=>{
 assert.deepEqual(appViewportSize({layoutHeight:850,visualHeight:690,visualTop:24,focused:false}),{height:850,top:0,keyboard:false});
});

test('the composer follows the visible viewport while the keyboard is open',()=>{
 assert.deepEqual(appViewportSize({layoutHeight:850,visualHeight:480,visualTop:12,focused:true}),{height:480,top:12,keyboard:true});
});

test('a small visual viewport adjustment does not pretend the keyboard is open',()=>{
 assert.deepEqual(appViewportSize({layoutHeight:850,visualHeight:790,visualTop:0,focused:true}),{height:850,top:0,keyboard:false});
});
