const express = require('express');
const router = express.Router();

const heatmaps = new Map();

router.post('/:id', (req, res) => {
  const heatmapId = req.params.id;
  const clicks = req.body;
  
  if (!Array.isArray(clicks)) {
    return res.status(400).json({ error: 'Invalid data format' });
  }
  
  if (!heatmaps.has(heatmapId)) {
    heatmaps.set(heatmapId, []);
  }
  
  const heatmapData = heatmaps.get(heatmapId);
  
  clicks.forEach(click => {
    heatmapData.push({
      x: click.x,
      y: click.y,
      timestamp: Date.now()
    });
  });
  
  if (heatmapData.length > 10000) {
    heatmaps.set(heatmapId, heatmapData.slice(-10000));
  }
  
  res.json({ success: true, message: 'Clicks recorded' });
});

router.get('/:id', (req, res) => {
  const heatmapId = req.params.id;
  const data = heatmaps.get(heatmapId) || [];
  
  const since = req.query.since ? parseInt(req.query.since) : 0;
  const filteredData = since > 0 
    ? data.filter(click => click.timestamp > since)
    : data;
  
  res.json({
    heatmapId,
    totalClicks: filteredData.length,
    data: filteredData.map(c => ({ x: c.x, y: c.y }))
  });
});

router.delete('/:id', (req, res) => {
  const heatmapId = req.params.id;
  
  if (!heatmaps.has(heatmapId)) {
    return res.status(404).json({ error: 'Heatmap not found' });
  }
  
  heatmaps.delete(heatmapId);
  res.json({ success: true, message: 'Heatmap data deleted' });
});

router.post('/:id/reset', (req, res) => {
  const heatmapId = req.params.id;
  heatmaps.set(heatmapId, []);
  res.json({ success: true, message: 'Heatmap data cleared' });
});

module.exports = router;
