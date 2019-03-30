const util = require('util');
const url = require('url');
const fs = require('fs');
const path = require('path');
const cron = require('cron');
const Logger = require('../utils/logger.js');
const utils = require('../utils/utils.js');
const EventsManager = require('../manager/events_manager.js');
const chokidar = require('chokidar');
const readDir = util.promisify(fs.readdir);
const readFile = util.promisify(fs.readFile);

class Events {
    constructor() {
        this._listeners = [];
        this._lastPubSubTime = new Date();
        this._eventsStorage = utils.datasetsConfig.storage + '/events';
        this._logger =  Logger.getLogger(utils.serverConfig.logLevel || 'info');
        this._knownAgencies = [];
        this._reconnectionTime = utils.datasetsConfig.reconnectionTime;
	this._last_update = new Date();
	this._pushJob = chokidar.watch(this.eventsStorage, {
  		ignored: /(^|[\/\\])\../,
  		persistent: true,
		awaitWriteFinish: true // Wait until file has been written by the EventsManager
	});
	this._pushJob.on('change', async (path) => {
		this.logger.info('New events...');
		await this._handleWatcher(path);
	});
    }

    /**
     * Handles the file watcher events by triggering a SSE push.
     * @param self `this` access in callback.
     * @param file The file path of the file event.
     * @param info Information about the file event.
     */
    async _handleWatcher(file) {
	this.logger.debug(`Found a new events file, pushing to SSE clients...`);
	await this._handlePubSub(file);
    }

    async getEventsSSE(req, res) {
        let t0 = new Date();
        let t1;
        let agency = req.params.agency;
        // Check if we have this agency already in our cache
        if(this.knownAgencies.indexOf(agency) > -1) {
            // Maybe this agency was recently added, check it before rejecting
            let dir = path.join(this.eventsStorage, agency);
            if(!fs.existsSync(dir)) {
                this.logger.error(`Unable to retrieve events for agency: ${agency}, agency doesn't exist`);
                res.sse.data(`Agency ${agency} not found`);
                res.end();
                return;
            }
            // New agency, push it to the cache
            else {
                this.knownAgencies.push(agency);
            }
        }

        this.logger.debug('HTTP SSE client connected');
        await this._addListenerPubSub(req, res, agency);

        t1 = new Date();
        this.logger.info(`Handling events client (totally) took: ${t1.getTime() - t0.getTime()} ms`);
  }

    /**
     * Dispatches the events requests to the right handlers and checks if the request is valid.
     * @param req The request object
     * @param res The response object
     * @author Dylan Van Assche
     */
    async getEventsPolling(req, res) {
        let t0 = new Date();
        let t1;

        let agency = req.params.agency;
        // Check if we have this agency already in our cache
        if(this.knownAgencies.indexOf(agency) > -1) {
            // Maybe this agency was recently added, check it before rejecting
            let dir = path.join(this.eventsStorage, agency);
            if(!fs.existsSync(dir)) {
                this.logger.error(`Unable to retrieve events for agency: ${agency}, agency doesn't exist`);
                res.status(404);
                res.json({
                    'error': 404,
                    'message': `Agency ${agency} not found`
                });
                return;
            }
            // New agency, push it to the cache
            else {
                this.knownAgencies.push(agency);
            }
        }

        this.logger.debug('HTTP polling client connected');
        await this._handlePolling(req, res, agency);

        t1 = new Date();
        this.logger.info(`Handling events client (totally) took: ${t1.getTime() - t0.getTime()} ms`);
    }

    /**
     * Adds a client to the listeners queue of an agency.
     * The client gets an individual update between now and its lastSyncTime.
     * @param req The request object
     * @param res The response object
     * @param lastSyncTime The last time the client received an update (Date object).
     * @param agency The agency for which the client wants to receive an update.
     * @private
     * @author Dylan Van Assche
     */
    async _addListenerPubSub(req, res, agency) {
        let t0 = new Date();
        let t1;

        // Generate listeners queue for new agencies, the client can be the first one who requests an agency
        if(!(agency in this.listeners)) {
            this.logger.debug(`Pubsub request for a new agency: ${agency}, creating listeners queue...`)
            this.listeners[agency] = [];
        }
        
        // Add the listener to the pool, attach the 'close' event to remove the listener when the connection is closed.
        this.listeners[agency].push(res);
        res.on('close', () => {
            this.listeners[agency].splice(this.listeners[agency].indexOf(res), 1);
        });
        
        t1 = new Date();
        this.logger.info('Adding and syncing pubsub client took: ' + (t1.getTime() - t0.getTime()) + ' ms' );
    }

    /**
     * Handles a pubsub client by pushing the new data to the client when the events are generated by the EventsManager.
     * @param file The path of the new events file.
     * @param agency The agency for which the client wants to receive an update.
     * @private
     * @author Dylan Van Assche
     */
    async _handlePubSub(file) {
	let page = fs.readFileSync(file, "utf8");
	page = JSON.parse(page);
	let agency = path.basename(path.dirname(file));
        this._pushToClients(this.listeners[agency][0], new Date(), page, true);
    }

    /**
     * Handles a polling client by serving the right page depending on the `lastSyncTime`.
     * @param res The response object
     * @param req The request object
     * @param agency The agency for which the client wants to receive an update.
     * @private
     * @author Dylan Van Assche
     */
    async _handlePolling(req, res, agency) {
        let t0 = new Date();
        let t1;

	// Try to close the request with a HTTP 304
	let events = await this._getEventsPage(req, res, agency);
        let dir = path.join(this.eventsStorage, agency);
	if(!utils.handleConditionalGET(req, res, path.join(dir, 'events.jsonld'), new Date())) {
	    // Data is changed
	    res.json(events);
	}
	
        t1 = new Date();
        this.logger.info('Polling client handling took: ' + (t1.getTime() - t0.getTime()) + ' ms' );
    }

    /**
     * Gets all the generated events for the `when` timestamp.
     * @param when the timestamp of the events we need.
     * @param agency the company for which we're publishing events.
     * @return page If a page answers the search query, the page will be returned. In any other case, `null` is returned.
     * @private
     * @author Dylan Van Assche
     */
    async _getEventsPageOld(req, res, when, agency, allowRedirect) {
        // Check all published events and compile a list of all events in the given time range.
        let page = {};
        let dir = path.join(this.eventsStorage, agency);
        let entries = await readDir(dir);
        
        // Binary search of target
        let target = when.getTime();
        let array = [];
        for(let e=0; e < entries.length; e++) {
            let t = new Date(path.basename(entries[e], '.jsonld'));
            array.push(t.getTime());
        }
        array.sort(); // Sorted array is required for binary search
        
        // Target time is later than our latest event file, redirect the client to this file
	let result = [];
        if(array[array.length-1] < target) {
            let lastPageTimestamp = new Date(array[array.length-1]);
	    // Only polling client may close the connection
	    if(allowRedirect) { 
		return [null, lastPageTimestamp];
	    }
            result.push(array[array.length-1]);
	    result.push(array.length-1);
        }
	else {
             result = utils.binarySearch(target, array);
	}

        // We should start looking for the page using a binary search
        let eventsDatePrevious = null;
        let eventsDateCurrent = null;
        let eventsDateNext = null;
        if(result !== null) {
            let pageTimestamp = new Date(result[0]);
            let index = result[1];
       
            if(index > 1) {
                eventsDatePrevious = new Date(array[index - 1]);
            }
            
            if(index < array.length-1) {
                eventsDateNext = new Date(array[index + 1]);
            }

            eventsDateCurrent = pageTimestamp; 
            let page = eventsDateCurrent.toISOString() +  '.jsonld';
            page = await readFile(path.join(dir, page));
            page = JSON.parse(page);
            page = this._addHydraMetaData(req, res, page, agency, eventsDatePrevious, eventsDateCurrent, eventsDateNext);
            return [page, pageTimestamp];
        }

        this.logger.error(`No page found for timestamp: ${when.toISOString()}`);
        return null;
    }

    async _getEventsPage(req, res, agency) {
        let dir = path.join(this.eventsStorage, agency);
	let page = await readFile(path.join(dir, 'events.jsonld'));
	page = JSON.parse(page);
        page = this._addHydraMetaData(req, res, page, agency);
	return page;
    }

    /**
     * Add hydra meta data to the page.
     * @param req The request object.
     * @param res The response object.
     * @param page The page without meta data.
     * @param agency The agency related to the page.
     * @param previousPageTimestamp The previous page timestamp.
     * @param currentPageTimestamp The current page timestamp.
     * @param nextPageTimestamp The next page timestamp.
     * @return page The page with meta data.
     * @private
     * @author Dylan Van Assche
     */
    _addHydraMetaData(req, res, page, agency) {
        // Determine protocol (i.e. HTTP or HTTPS)
        let xForwardedProto = req.headers['x-forwarded-proto'];
        let protocol = '';

        if (typeof xForwardedProto == 'undefined' || xForwardedProto == '') {
            if (typeof utils.serverConfig.protocol == 'undefined' || utils.serverConfig.protocol == '') {
                protocol = 'http';
            } else {
                protocol = utils.serverConfig.protocol;
            }
        } else {
            protocol = xForwardedProto;
        }

        let host = protocol + '://' + utils.serverConfig.hostname + '/';
        let eventsURI = host + agency + '/events?lastSyncTime=';
        let templateURI = host + agency + '/events{?lastSyncTime}';
        let pageURI = host + agency + '/connections?departureTime=';

        // Update graph
        page['@id'] = eventsURI + new Date().toISOString();
        page['hydra:search']['hydra:template'] = templateURI;

        // Add the data to the graph
        let graph = page['@graph'];
        for(let g=0; g < graph.length; g++) {
            graph[g]['hydra:view'] = pageURI + graph[g]['sosa:hasResult']['Connection']['departureTime'];
        }

        return page;
    }

    /**
     * Push the given data to the client according to the SSE protocol.
     * @param client The client (response object) who wants to receive the data.
     * @param id The id of the message, usefull for resyncing in case something goes wrong.
     * @param data The data of the message.
     * @param eventType The type of event, default `message`. This can be used to ping the clients too!
     * @private
     * @author Dylan Van Assche
     */
    _pushToClients(client, id, data, broadcast, eventType='message') {
        // Remove hydra navigation metadata since we don't use it for pubsub
        let dataCloned = JSON.parse(JSON.stringify(data)); // Do not modify the original data
        delete dataCloned['@context']['hydra:next'];
        delete dataCloned['@context']['hydra:previous'];
        delete dataCloned['hydra:next'];
        delete dataCloned['hydra:previous'];

        // Push to client
	if(broadcast) {
		client.sse.broadcast.event(eventType, dataCloned, id);
	}
	else {
		console.error('Updating client...');
		client.sse.event(eventType, dataCloned, id);
	}
    }

    get listeners() {
        return this._listeners;
    }

    set listeners(l) {
        this._listeners = l;
    }

    get lastPubSubTime() {
        return this._lastPubSubTime;
    }

    set lastPubSubTime(t) {
        this._lastPubSubTime = t;
    }

    get logger() {
        return this._logger;
    }

    get eventsStorage() {
        return this._eventsStorage;
    }

    get watcher() {
        return this._watcher;
    }

    get reconnectionTime() {
        return this._reconnectionTime;
    }

    get knownAgencies() {
        return this._knownAgencies;
    }
}

module.exports = Events;
