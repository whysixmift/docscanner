const fs = require('fs');

async function runExtendedAudit() {
  const cvPromise = require('../public/opencv.js');
  const cv = await cvPromise;

  // We will test both the current detector and new improved pipeline strategies
  console.log('Testing extended edge cases...');

  const extendedCases = [
    {
      name: '8. Document with dense text paragraphs and headers',
      bg: 40, paper: 245,
      quad: [{x: 120, y: 80}, {x: 680, y: 100}, {x: 640, y: 540}, {x: 140, y: 500}],
      hasText: true,
    },
    {
      name: '9. Textured wood grain background with strong horizontal line edges',
      bg: 70, paper: 240,
      quad: [{x: 150, y: 90}, {x: 670, y: 110}, {x: 630, y: 520}, {x: 130, y: 490}],
      texturedBg: true,
    },
    {
      name: '10. Document with one folded / clipped corner (pentagon)',
      bg: 45, paper: 240,
      // Top-right corner is folded inwards
      polygon: [
        {x: 120, y: 80},   // TL
        {x: 620, y: 95},   // before folded corner
        {x: 680, y: 150},  // after folded corner
        {x: 640, y: 530},  // BR
        {x: 130, y: 500}   // BL
      ],
      expectedQuad: [{x: 120, y: 80}, {x: 680, y: 95}, {x: 640, y: 530}, {x: 130, y: 500}],
    },
    {
      name: '11. Very low contrast (white paper 245 on off-white desk 225)',
      bg: 225, paper: 245,
      quad: [{x: 140, y: 100}, {x: 660, y: 120}, {x: 620, y: 510}, {x: 130, y: 480}],
    },
    {
      name: '12. Strong cast shadow across paper',
      bg: 50, paper: 240,
      quad: [{x: 120, y: 90}, {x: 660, y: 110}, {x: 620, y: 530}, {x: 130, y: 500}],
      shadow: true,
    }
  ];

  return { cv, extendedCases };
}

runExtendedAudit().catch(console.error);
