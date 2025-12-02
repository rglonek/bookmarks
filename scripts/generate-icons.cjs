/**
 * Generate PWA icons for the Bookmarks app
 * Run with: node scripts/generate-icons.cjs
 */

const { createCanvas } = require('canvas');
const fs = require('fs');
const path = require('path');

const sizes = [192, 512];
const outputDir = path.join(__dirname, '..', 'public', 'icons');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');

  // Background gradient (blue)
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  gradient.addColorStop(0, '#3b82f6');
  gradient.addColorStop(1, '#1d4ed8');

  // Draw circular background
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.46, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();

  // Draw bookmark shape
  const scale = size / 192;
  const bookmarkWidth = 80 * scale;
  const bookmarkHeight = 120 * scale;
  const startX = (size - bookmarkWidth) / 2;
  const startY = size * 0.18;
  const cornerRadius = 8 * scale;

  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.beginPath();
  
  // Top-left corner
  ctx.moveTo(startX + cornerRadius, startY);
  // Top edge
  ctx.lineTo(startX + bookmarkWidth - cornerRadius, startY);
  // Top-right corner
  ctx.quadraticCurveTo(startX + bookmarkWidth, startY, startX + bookmarkWidth, startY + cornerRadius);
  // Right edge
  ctx.lineTo(startX + bookmarkWidth, startY + bookmarkHeight);
  // Bottom point (bookmark fold)
  ctx.lineTo(startX + bookmarkWidth / 2, startY + bookmarkHeight - 25 * scale);
  ctx.lineTo(startX, startY + bookmarkHeight);
  // Left edge
  ctx.lineTo(startX, startY + cornerRadius);
  // Top-left corner
  ctx.quadraticCurveTo(startX, startY, startX + cornerRadius, startY);
  
  ctx.closePath();
  ctx.fill();

  // Add a subtle header bar
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.beginPath();
  ctx.moveTo(startX + cornerRadius, startY);
  ctx.lineTo(startX + bookmarkWidth - cornerRadius, startY);
  ctx.quadraticCurveTo(startX + bookmarkWidth, startY, startX + bookmarkWidth, startY + cornerRadius);
  ctx.lineTo(startX + bookmarkWidth, startY + 16 * scale);
  ctx.lineTo(startX, startY + 16 * scale);
  ctx.lineTo(startX, startY + cornerRadius);
  ctx.quadraticCurveTo(startX, startY, startX + cornerRadius, startY);
  ctx.closePath();
  ctx.fill();

  // Save to file
  const outputPath = path.join(outputDir, `icon-${size}.png`);
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
  console.log(`Generated: ${outputPath}`);
}

// Generate all sizes
sizes.forEach(generateIcon);
console.log('Done! Icons generated successfully.');

