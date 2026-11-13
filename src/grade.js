// 绯魇调色：全屏后期（在 Bloom 之后、OutputPass 之前，线性空间）。
// 红色保留并略增，其它颜色去饱和并偏向红黑；暗部略压。强度 amount 由游戏平滑插值（无频闪）。
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
export const GradeShader = {
  uniforms: { tDiffuse: { value: null }, amount: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float amount; varying vec2 vUv;
    void main(){
      vec4 t = texture2D(tDiffuse, vUv); vec3 c = t.rgb;
      if (amount <= 0.0001) { gl_FragColor = t; return; }
      float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
      vec3 q = sqrt(max(c, 0.0));                                            // 近似感知空间判断"红"（橙/黄不算）
      float red = smoothstep(0.5, 0.8, (q.r - max(q.g, q.b)) / (q.r + 0.02)); // 偏红像素保留色彩
      vec3 g = mix(vec3(lum), c, 0.12 + 0.88 * red);                        // 非红去饱和
      g *= mix(vec3(1.0, 0.66, 0.68), vec3(1.15, 0.9, 0.9), red);         // 整体偏红黑
      g *= mix(0.72, 1.0, smoothstep(0.0, 0.35, lum));                       // 暗部下压（柔和，不切黑）
      gl_FragColor = vec4(mix(c, g, amount), t.a);
    }`,
};
export function makeGradePass() { const p = new ShaderPass(GradeShader); p.material.toneMapped = false; return p; }
