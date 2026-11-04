import { repairLatex } from './latex.js';

describe('repairLatex', () => {
  it('fixes over-escaped commands', () => {
    expect(repairLatex('C = 2\\\\pi r \\\\approx 31.4')).toBe('C = 2\\pi r \\approx 31.4');
    expect(repairLatex('\\\\frac{a}{b}')).toBe('\\frac{a}{b}');
  });

  it('leaves correct LaTeX alone', () => {
    expect(repairLatex('C = 2\\pi r \\approx 31.4')).toBe('C = 2\\pi r \\approx 31.4');
    expect(repairLatex('x^2 + 1')).toBe('x^2 + 1');
  });

  it('keeps real line breaks', () => {
    expect(repairLatex('a \\\\ b')).toBe('a \\\\ b');
    expect(repairLatex('1 & 2 \\\\ 3 & 4')).toBe('1 & 2 \\\\ 3 & 4');
    expect(repairLatex('a \\\\[2pt] b')).toBe('a \\\\[2pt] b');
  });
});
