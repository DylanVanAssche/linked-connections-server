const { Hub, sseHub } = require('@toverux/expresse');
const express = require('express');
const router = express.Router();
const PageFinder = require('./page-finder.js');
const Memento = require('./memento.js');
const Catalog = require('./catalog.js');
const Events = require('./events.js');

let EventsRouter = new Events();
router.get('/:agency/connections', (req, res) => {
    new PageFinder().getConnections(req, res);
});

router.get('/:agency/connections/memento', (req, res) => {
    new Memento().getMemento(req, res);
});

router.get('/catalog', (req, res) => {
    new Catalog().getCatalog(req, res);
});

router.get('/:agency/events/sse', sseHub({ flushAfterWrite: true }), (req, res) => {
    EventsRouter.getEventsSSE(req, res);
});

router.get('/:agency/events', (req, res) => {
  //  if (req.stale) {
//	    res.setStatus(304);
    //}
    EventsRouter.getEventsPolling(req, res);
});


router.options('/*', (req, res) => {
    res.set({ 
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'accept-datetime', 
        'Content-Type': 'application/ld+json' 
    });

    res.send(200);
});

module.exports = router; 
