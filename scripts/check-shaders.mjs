// Compiles and links every shader in site/scene-shaders.js the way three.js wraps a
// ShaderMaterial on WebGL 2 (GLSL ES 3.00), using glslangValidator.
// Usage: node scripts/check-shaders.mjs   (needs glslangValidator, e.g. apt install glslang-tools)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as S from '../site/scene-shaders.js';

const COMMON = `precision highp float;
precision highp int;
precision highp sampler2D;
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
`;
const VERT = `#version 300 es
#define attribute in
#define varying out
#define texture2D texture
${COMMON}uniform mat4 modelMatrix;
uniform mat4 modelViewMatrix;
uniform mat4 projectionMatrix;
uniform mat3 normalMatrix;
in vec3 position;
in vec3 normal;
in vec2 uv;
`;
const FRAG = `#version 300 es
#define varying in
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define texture2D texture
${COMMON}`;

const dir = mkdtempSync(join(tmpdir(), 'shaders-'));
let failed = 0;
for (const [name, s] of Object.entries(S)) {
  const vert = s.vert ?? s.vertexShader;
  const frag = s.frag ?? s.fragmentShader;
  const v = join(dir, `${name}.vert`);
  const f = join(dir, `${name}.frag`);
  writeFileSync(v, VERT + vert);
  writeFileSync(f, FRAG + frag);
  // glslang doesn't match varyings across stages, so do it here: every varying the fragment
  // shader reads must be written by the vertex shader with the same type.
  const varyings = (src) => new Map([...src.matchAll(/varying\s+(\w+)\s+(\w+)\s*;/g)].map((m) => [m[2], m[1]]));
  const out = varyings(vert);
  for (const [n, type] of varyings(frag)) {
    if (out.get(n) !== type) {
      failed++;
      console.log(`✗ ${name}: varying ${type} ${n} is not passed from the vertex shader`);
    }
  }
  try {
    execFileSync('glslangValidator', ['-l', v, f], { encoding: 'utf8' });
    console.log(`✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`✗ ${name}\n${err.stdout || err.message}`);
  }
}
if (failed) {
  console.log(`::error::${failed} shader(s) failed to compile`);
  process.exit(1);
}
