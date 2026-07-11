// Shared art-direction presets used by both the thumbnail designer and the
// production video generator, so a channel's visual style stays consistent
// between its thumbnails and its video content.
const VISUAL_STYLES = {
  ethereal: "ethereal, dreamy, mystical, soft lighting, floating particles, cosmic background",
  modern: "modern, clean, minimalist, professional, sleek design, contemporary",
  animated: "animated style, cartoon, vibrant colors, expressive, dynamic",
  cinematic: "cinematic lighting, dramatic, movie poster style, high contrast, professional editorial photography style",
  abstract: "abstract art, geometric shapes, gradient colors, artistic composition",
  "traditional-cartoon": "hand-drawn 2D cartoon illustration in the style of a traditionally " +
    "animated explainer video, flat cel-shaded coloring, bold clean black outlines, warm " +
    "saturated color palette, simple appealing character and prop design, textured paper-like " +
    "background shading. Avoid photorealism, avoid 3D rendering, avoid glossy airbrushed " +
    "digital-art sheen, avoid extra fingers or warped hands, avoid any text or watermark.",
  "storytime-sketch": "Drawn in the rough, casual sketch-comic style of an independent YouTube " +
    "storytelling animator (like a webcomic artist's animatic), NOT a polished illustration. " +
    "Simple round or oval head shape. Hair rendered as one solid-color messy blob shape with " +
    "a few jagged strands, not individually rendered hair strands. Minimal facial features: " +
    "small simple dot or oval eyes, a small simple line or oval mouth, tiny flat circular blush " +
    "marks on the cheeks, no detailed shading on the face. Body and arms drawn as simplified, " +
    "slightly gangly stick-like shapes with plain simplified hands (a few simple stick fingers, " +
    "not fully anatomical). Thick, uneven, hand-drawn black marker/pen outlines around " +
    "everything. Mostly flat, muted, desaturated colors for the scene and characters, with " +
    "ONE or TWO small bold saturated color accents (like a single red object or sign) used " +
    "deliberately to draw the eye. No gradients, no soft airbrushed shading, no photorealistic " +
    "lighting, no intricate rendering, no symmetry — keep every shape deliberately simple, " +
    "rough, and a little imperfect, like a fast hand-drawn digital sketch, not AI-generated " +
    "concept art. No text, no logos, no watermark."
};

// Styles that are flat/illustrated rather than photographic — used to decide
// whether to append a "digital art" suffix (helpful for photo-real prompts,
// counterproductive for a deliberately hand-drawn/sketchy look).
const FLAT_SKETCH_STYLES = new Set(['traditional-cartoon', 'storytime-sketch']);

function getCurrentStyle() {
  return process.env.VISUAL_STYLE || 'cinematic';
}

function getStyleEnhancement(style) {
  return VISUAL_STYLES[style] || VISUAL_STYLES.ethereal;
}

module.exports = { VISUAL_STYLES, FLAT_SKETCH_STYLES, getCurrentStyle, getStyleEnhancement };
