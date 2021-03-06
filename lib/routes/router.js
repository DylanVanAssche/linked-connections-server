const express = require('express');
//const { Hub, sseHub } = require('@toverux/expresse');

const router = express.Router();
const PageFinder = require('./page-finder.js');
const Memento = require('./memento.js');
const Catalog = require('./catalog.js');
const Stops = require('./stops.js');
const Events = require('./events.js');
let eventsManager = new Events();

router.get('/:agency/connections', (req, res) => {
    new PageFinder().getConnections(req, res);
});

router.get('/:agency/connections/memento', (req, res) => {
    new Memento().getMemento(req, res);
});

router.get('/catalog', (req, res) => {
    new Catalog().getCatalog(req, res);
});

router.get('/:agency/stops', (req, res) => {
    new Stops().getStops(req, res);
});

router.get('/:agency/events/sse', (req, res) => {
    eventsManager.getEventsSSE(req, res);
});

router.get('/:agency/events', (req, res) => {
    eventsManager.getEventsPolling(req, res);
});

router.options('/*', (req, res) => {
    res.set({ 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': '*', 
        'Content-Type': 'application/ld+json' 
    });

    res.send(200);
});

module.exports = router; 
