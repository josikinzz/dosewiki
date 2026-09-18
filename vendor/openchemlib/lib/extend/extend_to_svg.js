/**
 * Extends the instance method toSVG to handle options and sanitise the generated SVG.
 * @param {*} Molecule
 */
export function extendToSVG(Molecule) {
  const _toSVG = Molecule.prototype.toSVG;
  Molecule.prototype.toSVG = function toSVG(width, height, id, options) {
    if (typeof width !== 'number' || typeof height !== 'number') {
      throw new Error(
        'Molecule#toSVG requires width and height to be specified',
      );
    }
    options = options || {};
    const factorTextSize = options.factorTextSize || 1;
    const autoCrop = options.autoCrop === true;
    const autoCropMargin =
      options.autoCropMargin === undefined ? 5 : options.autoCropMargin;

    let svg = _toSVG.call(
      this,
      width,
      height,
      factorTextSize,
      autoCrop,
      autoCropMargin,
      id,
      options,
    );

    const finalId = /svg id="(.*)" xmlns/.exec(svg)[1];

    // Place the id of the SVG element on all selectors, otherwise the style
    // will leak into other SVG elements that are rendered on the same page.
    svg = svg.replace(
      '<style>',
      `<style> #${finalId} text {font-family: sans-serif;}`,
    );
    svg = svg.replace('line {', `#${finalId} line {`);
    svg = svg.replace('polygon {', `#${finalId} polygon {`);

    if (options.fontWeight) {
      svg = svg.replaceAll(
        'font-size=',
        `font-weight="${options.fontWeight}" font-size=`,
      );
    }
    if (options.strokeWidth) {
      // DoseWiki local modification: the option re-bases only the standard
      // line width. Strokes the depictor deliberately draws wider — bold bonds,
      // sized to match a solid wedge's broad end — keep their absolute width,
      // because wedges are filled polygons whose geometry a stroke-width
      // rewrite cannot touch.
      const widths = [...svg.matchAll(/stroke-width="([^"]+)"/g)].map((match) =>
        Number(match[1]),
      );
      const base = widths.length > 0 ? Math.min(...widths) : 0;
      const target = Number(options.strokeWidth);
      svg = svg.replaceAll(/stroke-width="([^"]+)"/g, (match, value) => {
        return Number(value) === base ? `stroke-width="${target}"` : match;
      });
    }
    return svg;
  };
}
