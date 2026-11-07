import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

type Rgb = [number, number, number];

const css = readFileSync(resolve(import.meta.dirname, "tokens.css"), "utf8");
const block = css.slice(css.indexOf('[data-design="poster"],'));

/** 포스터 블록의 값을 테마별로 읽는다. light-dark()가 아니면 두 테마가 같다. */
function token(name: string, theme: 0 | 1) {
  const value = block.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();
  if (!value) throw new Error(`--${name} 없음`);
  const pair = value.match(/^light-dark\((.+),\s*((?:#|rgb).+)\)$/);
  return pair ? pair[theme + 1] : value;
}

function parse(color: string): { rgb: Rgb; alpha: number } {
  if (color.startsWith("#")) {
    const n = parseInt(color.slice(1), 16);
    return { rgb: [n >> 16, (n >> 8) & 255, n & 255], alpha: 1 };
  }
  const [r, g, b, a] = color.match(/[\d.]+/g)!.map(Number);
  return { rgb: [r, g, b], alpha: a ?? 1 };
}

const luminance = (rgb: Rgb) => {
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

function contrast(fg: string, bg: string) {
  const back = parse(bg).rgb;
  const { rgb, alpha } = parse(fg);
  const mixed = rgb.map((v, i) => v * alpha + back[i] * (1 - alpha)) as Rgb;
  const [hi, lo] = [luminance(mixed), luminance(back)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = ["ink", "ink-strong", "muted", "accent-ink", "ok", "danger"];
const SURFACES = ["bg", "raised", "sunken"];

test.each([
  ["라이트", 0],
  ["다크", 1],
] as const)("포스터 %s 토큰은 글자 대비 4.5:1 이상이다", (_, theme) => {
  for (const fg of TEXT) {
    for (const bg of SURFACES) {
      const ratio = contrast(token(fg, theme), token(bg, theme));
      expect(ratio, `${fg} / ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  expect(contrast(token("invert-fg", theme), token("invert-bg", theme))).toBeGreaterThanOrEqual(4.5);
  // 기본 버튼은 올렸을 때 accent-ink 면에 invert-fg 글자가 된다.
  expect(contrast(token("invert-fg", theme), token("accent-ink", theme))).toBeGreaterThanOrEqual(4.5);
  // accent 면에는 흰 글자를 얹는 곳이 있다.
  expect(contrast("#ffffff", token("accent", theme))).toBeGreaterThanOrEqual(4.5);
});
