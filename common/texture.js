export function generatePencilTextures(numTextures, width, height, style = 'pencil') {
  let paper;
  switch(style) {
    case 'charcoal':
      paper = new CharcoalPaper(width, height);
      break;
    case 'ink':
      paper = new InkPaper(width, height);
      break;
    case 'sketch':
      paper = new SketchPaper(width, height);
      break;
    default:
      paper = new Paper(width, height);
  }

  const textures = new Uint8ClampedArray(4 * width * height * numTextures);
  let index = 0;
  for (let i = 0; i < numTextures; i++) {
    paper.drawTexture(i / numTextures);
    for (let j = 0; j < width * height; j++) {
      const value = paper.data[j];
      textures[index++] = value;
      textures[index++] = value;
      textures[index++] = value;
      textures[index++] = 0xff;
    }
    paper.clear();
  }
  return new ImageData(textures, width, height * numTextures);
}

class Paper {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.thickness = 0.5;
    this.mu_b = 0.1;
    this.data = new Uint8ClampedArray(width * height);
    this.total = 0;
    this.clear();
  }

  clear() {
    for (let i = 0; i < this.width * this.height; i++) {
      this.data[i] = 0xff;
    }
    this.total = 0;
  }

  fromWH(w, h) {
    const h_new = ((h % this.height) + this.height) % this.height;
    const w_new = ((w % this.width) + this.width) % this.width;
    return h_new * this.width + w_new;
  }

  drawPixel(w, h, pressure) {
    const pos = this.fromWH(w, h);
    const oldValue = this.data[pos];
    let intermediateValue = oldValue * pressure;
    if (oldValue > 220) {
      intermediateValue *= 0.5;
    }
    const newValue = Math.round(oldValue - this.mu_b * intermediateValue);
    this.data[pos] = newValue;
    this.total += oldValue - newValue;
  }

  drawPoint(w, h, pressure) {
    const w_low = Math.round(w - this.thickness - 1);
    const w_high = Math.round(w + this.thickness + 1);
    const h_low = Math.round(h - this.thickness - 1);
    const h_high = Math.round(h + this.thickness + 1);
    for (let w_nxt = w_low; w_nxt <= w_high; w_nxt++) {
      for (let h_nxt = h_low; h_nxt <= h_high; h_nxt++) {
        const dist = Math.sqrt(Math.pow(w - w_nxt, 2) + Math.pow(h - h_nxt, 2));
        if (dist > this.thickness) {
          continue;
        }
        const distFactor =
          Math.sqrt(1 - dist / this.thickness) * Math.pow(Math.random(), 2);
        this.drawPixel(w_nxt, h_nxt, pressure * distFactor);
      }
    }
  }

  drawStroke(pressure) {
    const numSteps = this.width * 1.6;
    const stepSize = 0.5;

    let w = Math.random() * this.width;
    let h = Math.random() * this.height;

    for (let i = 0; i < numSteps; i++) {
      const dw = 1 + 0.04 * Math.random();
      const dh = 0.04 * Math.random();
      w += stepSize * dw;
      h += stepSize * dh;
      this.drawPoint(w, h, pressure);
    }
  }

  drawTexture(darkness) {
    let weight = darkness * darkness;
    let maxNumStrokes = Math.pow(1 / this.thickness, 2) * 100 * this.height;
    if (weight < 0.3) {
      maxNumStrokes = weight * (1.0 / 0.3) * maxNumStrokes;
      weight = 0.3;
    }
    let targetTotal = 255.0 * darkness * this.width * this.height;
    for (let i = 0; i < maxNumStrokes; i++) {
      this.drawStroke(weight);
      if (this.total >= targetTotal) {
        break;
      }
    }
  }
}

// Charcoal Paper - grainy, blocky, no linear strokes
class CharcoalPaper extends Paper {
  constructor(width, height) {
    super(width, height);
    this.thickness = 2.5;  // Thick for blocky appearance
    this.mu_b = 0.25;      // Much higher for darker marks
  }

  drawPixel(w, h, pressure) {
    const pos = this.fromWH(w, h);
    const oldValue = this.data[pos];
    let intermediateValue = oldValue * pressure * 1.2;  // Multiply for darker effect
    if (oldValue > 200) {
      intermediateValue *= 0.9;  // Less aggressive threshold
    }
    const newValue = Math.round(oldValue - this.mu_b * intermediateValue);
    this.data[pos] = newValue;
    this.total += oldValue - newValue;
  }

  // Draw random scattered dots instead of strokes for grainy effect
  drawBlob(pressure) {
    // Random blob position
    const centerW = Math.random() * this.width;
    const centerH = Math.random() * this.height;

    // Random blob size
    const blobRadius = this.thickness * (0.6 + 0.5 * Math.random());
    const numDots = Math.floor(blobRadius * 15);  // Even more dots per blob

    for (let i = 0; i < numDots; i++) {
      // Scatter dots around center
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * blobRadius;
      const w = centerW + Math.cos(angle) * distance;
      const h = centerH + Math.sin(angle) * distance;

      // Variable pressure for each dot - higher pressure
      const dotPressure = pressure * (0.8 + 0.6 * Math.random());
      this.drawPoint(w, h, dotPressure);
    }
  }

  drawTexture(darkness) {
    // Use blobs instead of strokes
    let weight = darkness * darkness * 1.3;  // Increase weight for darker result
    // More blobs for visible coverage
    let maxNumBlobs = Math.pow(1 / this.thickness, 2) * 85 * this.height;  // More blobs
    if (weight < 0.3) {
      maxNumBlobs = weight * (1.0 / 0.3) * maxNumBlobs;
      weight = 0.3;
    }
    let targetTotal = 255.0 * darkness * this.width * this.height;
    for (let i = 0; i < maxNumBlobs; i++) {
      this.drawBlob(weight);
      if (this.total >= targetTotal) {
        break;
      }
    }
  }
}

// Ink Paper - thin, sharp, high contrast strokes
class InkPaper extends Paper {
  constructor(width, height) {
    super(width, height);
    this.thickness = 0.35;  // Slightly thicker for performance
    this.mu_b = 0.25;       // Very sharp, high contrast
  }

  drawPixel(w, h, pressure) {
    const pos = this.fromWH(w, h);
    const oldValue = this.data[pos];
    // Higher contrast - more aggressive darkening
    let intermediateValue = oldValue * pressure * 1.8;
    if (oldValue > 230) {
      intermediateValue *= 0.2;  // Very sharp threshold
    }
    const newValue = Math.round(oldValue - this.mu_b * intermediateValue);
    this.data[pos] = Math.max(newValue, 0);
    this.total += oldValue - newValue;
  }

  drawStroke(pressure) {
    const numSteps = this.width * 1.5;  // Reduced for performance
    const stepSize = 0.45;

    let w = Math.random() * this.width;
    let h = Math.random() * this.height;

    for (let i = 0; i < numSteps; i++) {
      const dw = 1 + 0.02 * Math.random();  // Less variation, straighter
      const dh = 0.02 * Math.random();
      w += stepSize * dw;
      h += stepSize * dh;
      this.drawPoint(w, h, pressure);
    }
  }

  drawTexture(darkness) {
    // Ink needs fewer strokes due to high contrast
    let weight = darkness * darkness * 1.2;
    let maxNumStrokes = Math.pow(1 / this.thickness, 2) * 60 * this.height;  // Reduced multiplier
    if (weight < 0.35) {
      maxNumStrokes = weight * (1.0 / 0.35) * maxNumStrokes;
      weight = 0.35;
    }
    let targetTotal = 255.0 * darkness * this.width * this.height;
    for (let i = 0; i < maxNumStrokes; i++) {
      this.drawStroke(weight);
      if (this.total >= targetTotal) {
        break;
      }
    }
  }
}

// Sketch Paper - flowing, artistic, hand-drawn style like the horse example
class SketchPaper extends Paper {
  constructor(width, height) {
    super(width, height);
    this.thickness = 0.8;    // Much thicker for visible, bold strokes
    this.mu_b = 0.12;        // Higher for darker, more visible lines
  }

  drawPixel(w, h, pressure) {
    const pos = this.fromWH(w, h);
    const oldValue = this.data[pos];
    let intermediateValue = oldValue * pressure * 0.9;  // Stronger application for visibility
    if (oldValue > 230) {
      intermediateValue *= 0.6;  // Keep highlights bright
    } else if (oldValue > 200) {
      intermediateValue *= 0.8;  // Gentle transition
    }
    const newValue = Math.round(oldValue - this.mu_b * intermediateValue);
    this.data[pos] = newValue;
    this.total += oldValue - newValue;
  }

  drawStroke(pressure) {
    // Very long, flowing strokes for bold sketch lines
    const numSteps = this.width * 2.5;  // Much longer strokes
    const stepSize = 0.6;  // Larger steps for longer lines

    let w = Math.random() * this.width;
    let h = Math.random() * this.height;

    // Start with a random direction
    let angle = Math.random() * Math.PI * 2;
    let angleVelocity = 0;

    for (let i = 0; i < numSteps; i++) {
      // Smooth, flowing angle changes (like hand movement)
      angleVelocity += (Math.random() - 0.5) * 0.08;  // Less variation for straighter lines
      angleVelocity *= 0.96;  // More damping for smoother curves
      angle += angleVelocity;

      const dw = Math.cos(angle);
      const dh = Math.sin(angle);

      w += stepSize * dw;
      h += stepSize * dh;

      // Variable pressure that changes smoothly along the stroke
      const progress = i / numSteps;
      const pressureCurve = Math.sin(progress * Math.PI);  // Lighter at ends
      const pressureNoise = 0.8 + 0.2 * Math.random();  // Less variation for consistency
      const sketchyPressure = pressure * pressureCurve * pressureNoise;

      // Draw most points for continuous, bold lines
      if (Math.random() > 0.05) {  // Skip only 5% for very continuous lines
        this.drawPoint(w, h, sketchyPressure);
      }
    }
  }

  drawTexture(darkness) {
    // Fewer strokes for less dense, more visible individual lines
    let weight = darkness * darkness * 1.0;  // Higher weight for darker lines
    let maxNumStrokes = Math.pow(1 / this.thickness, 2) * 35 * this.height;  // Much fewer strokes
    if (weight < 0.25) {
      maxNumStrokes = weight * (1.0 / 0.25) * maxNumStrokes;
      weight = 0.25;
    }
    // Lower target for sparser coverage
    let targetTotal = 255.0 * darkness * 0.6 * this.width * this.height;
    for (let i = 0; i < maxNumStrokes; i++) {
      this.drawStroke(weight);
      if (this.total >= targetTotal) {
        break;
      }
    }
  }
}
