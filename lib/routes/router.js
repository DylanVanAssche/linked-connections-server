const express = require('express');
const router = express.Router();

const PageFinder = require('./page-finder.js');
const Memento = require('./memento.js');
const Stops = require('./stops.js');
const Catalog = require('./catalog.js');

router.get('/:agency/:zone/connections', (req, res) => {
    new PageFinder().getConnections(req, res);
});

router.get('/:agency/:zone/connections/memento', (req, res) => {
    new Memento().getMemento(req, res);
});

router.get('/:agency/:zone/stops', (req, res) => {
    new Stops().getDelijnStopsByZone(req, res)
});

router.get('/catalog', (req, res) => {
    new Catalog().getCatalog(req, res);
});

module.exports = router;