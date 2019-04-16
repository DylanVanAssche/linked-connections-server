const utils = require('../utils/utils.js');
const Logger = require('../utils/logger');
const fs = require('fs');
const util = require('util');
const readFile = util.promisify(fs.readFile);

class EventsManager {
    constructor() {
        this._previousEvents = {};
	this._previousEventsIndex = {};
	this._currentEventsIndex = {};
	this._currentEvents = {};
	this._previousPublishedEventsCounter = {};
        this._pendingEvents = {};
        this._eventsStorage = utils.datasetsConfig.storage + '/events';
	this._eventsFileName = "events.jsonld";
        this._logger = Logger.getLogger(utils.serverConfig.logLevel || 'info');
    }

    /**
     * Add an event for publication. The manager will automatically publish it later.
     * @param pageURI where the connection can be found.
     * @param connection which describes the information of the event (connection).
     * @param agency the agency of the connection.
     */
    addEvent(connection, agency) {
        // Check if we're pushing valid events to the queue
        if(typeof connection === 'undefined' || connection === null) {
            this.logger.error('Invalid connection, unable to push event to pending events!');
            return;
        }
        if(typeof agency === 'undefined' || agency === null) {
            this.logger.error('Invalid agency name, unable to push event to pending events!');
            return;
        }

        // Create agency if it doesn't exist yet
        if(!(agency in this.pendingEvents)) {
            this.logger.debug(`Events received for a new agency: ${agency}, creating storage...`)
            this.pendingEvents[agency] = [];
            this.previousEvents[agency] = [];
	    this.previousEventsIndex[agency] = [];
	    this._currentEventsIndex[agency] = [];
            this._currentEvents[agency] = {};
	    this.previousPublishedEventsCounter[agency] = 0;
            // NodeJS 10.X.X or later
            if (!fs.existsSync(this.eventsStorage + '/' + agency)) {
                fs.mkdirSync(this.eventsStorage + '/' + agency, { recursive: true });
            }
        }

	this._currentEventsIndex[agency].push(connection['@id']);
	this._currentEvents[agency][connection['@id']] = connection;
	
	// New event
	let isNew = false;
	if(this.previousEventsIndex[agency].indexOf(connection['@id']) < 0) {
	    isNew = true;
	    this.logger.debug('NEW EVENT: ' + connection['@id']);
	}
        // Event exist already, check delays and cancelations
	else {
	     if(this._previousEvents[agency][connection['@id']]['departureDelay'] !== connection['departureDelay']) {
	         isNew = true;
		 this.logger.debug('EVENT updated: ' + connection['@id'] + ' Departure delay ' + this._previousEvents[agency][connection['@id']]['departureDelay'] + ' -> ' + connection['departureDelay'])
	     }
	     if(this._previousEvents[agency][connection['@id']]['arrivalDelay'] !== connection['arrivalDelay']) {
	         isNew = true;
		 this.logger.debug('EVENT updated: ' + connection['@id'] + ' Arrival delay ' + this._previousEvents[agency][connection['@id']]['arrivalDelay'] + ' -> ' + connection['arrivalDelay'])
	     }
	     if(this._previousEvents[agency][connection['@id']]['@type'] !== connection['@type']) {
	         isNew = true;
		 this.logger.debug('EVENT updated: ' + connection['@id'] + ' Type ' + this._previousEvents[agency][connection['@id']]['@type'] + ' -> ' + connection['@type'])
	     }
	}
	
	if(isNew) {
            this.pendingEvents[agency].push({
                id: new Date(),
                connection: connection,
            });
	}
	

        /*// Event is already published, check if the event has been updated
        let isNew = false;
	let isReferenced = false;

        // Already generated this event, check if it's updated...
	let existingEvent = null;
        if(this.previousEventsIndex[agency].indexOf(connection['@id']) >= 0) {
            existingEvent = this.previousEvents[agency].find(event => event['connection']['@id'] === connection['@id']);
	    if(typeof existingEvent == 'undefined') {
		this.logger.warn('Unable to find event for connection: ' + connection['@id'])
		return;
	    }
            let type = existingEvent['connection']['@type'];
            let departureDelay = existingEvent['connection']['departureDelay'];
            let arrivalDelay = existingEvent['connection']['arrivalDelay'];
	    //isReferenced = true;
            if(type !== connection['@type'] || departureDelay !== connection['departureDelay'] || arrivalDelay !== connection['arrivalDelay']) {
                isNew = true;
                this.logger.debug('Existing event has been updated for connection: ' + connection['@id']);
                if(type !== connection['@type']) {
                    this.logger.debug('Reason: ' + type + ' -> ' + connection['@type']);
                }

                if(departureDelay !== connection['departureDelay']) {
                    this.logger.debug('Reason: departure delay ' + departureDelay + ' min -> ' + connection['departureDelay'] + ' min');
                }

                if(arrivalDelay !== connection['arrivalDelay']){
                    this.logger.debug('Reason: arrival delay ' + arrivalDelay + ' min -> ' + connection['arrivalDelay'] + ' min');
                }

                // Existing event updated, removing the old one
                this.previousEvents[agency].splice(this.previousEvents[agency].indexOf(existingEvent), 1);
            }
        }
        // New event
        else {
            //this.logger.debug('NEW: ' + connection['@id'] + ': DEP: ' + connection['departureDelay'] + ' ARR: ' + connection['arrivalDelay'] + ' TYP: ' + connection['@type'])
            //this.previousEventsIndex[agency].push(connection['@id']);
            isNew = true;
        }

        // Add event to the queue if changed, update the previousEvents with the new event
        if(isNew) {
            this.pendingEvents[agency].push({
                id: new Date(),
                connection: connection,
            });
            this.previousEvents[agency].push({
                referenced: 120, // Delete after 1 hour (120x 30 sec)
                connection: connection
            });
        }
	/*else if(isReferenced) {
	    //let index = this.previousEvents[agency].indexOf(existingEvent);
	    //this.previousEvents[agency][index]['referenced'] = 120; // Delete after 1 hour
	}*/
    }

    /**
     * Callback method which automatically publishes the events that are pending after the `setInterval` timer has run out.
     * @param timestamp Timestamp for the GTFS-RT version (Date object)
     */
    async processEvents(timestamp) {
        // Skeleton of the event publication
        let template = await readFile('./statics/events_skeleton.jsonld', { encoding: 'utf8' });
        let skeleton = JSON.parse(template);
        timestamp = new Date(timestamp.setMilliseconds(0)); // Remove microseconds from timestamp 


        // Read each pending event, add it to the knowledge graph
        for(let pE=0; pE < Object.keys(this.pendingEvents).length; pE++) {
            let pendingEventsForAgencyCounter = 0;
            let agency = Object.keys(this.pendingEvents)[pE];
	    this.previousEventsIndex[agency] = this._currentEventsIndex[agency];
            this._currentEventsIndex[agency] = [];
	    this.previousEvents[agency] = this._currentEvents[agency];
	    this._currentEvents[agency] = [];
	    this.logger.debug('Known events: ' + this.previousEventsIndex[agency].length)

            // NodeJS 10.X.X or later
            if (!fs.existsSync(this.eventsStorage + '/' + agency)) {
                fs.mkdirSync(this.eventsStorage + '/' + agency, { recursive: true });
            }

            let pendingEventsForAgency = this.pendingEvents[agency];
            if(pendingEventsForAgency.length === 0) {
                this.logger.debug(`No events pending for agency: ${agency}`)
            }

            // We have at least one event, use the first event departure time (without the departure delay) as name of the file.
            while (pendingEventsForAgency.length > 0) {
                // Keep order of publication using .shift()
                let eventData = pendingEventsForAgency.shift();
        	
                // Add LOD vocabulary for each event
                let event = {
                    '@id': eventData['connection']['@id'] + '#' + eventData['id'].toISOString(),
                    '@type': 'Event',
                    'hydra:view': '',
                    'sosa:resultTime': eventData['id'],
                    'sosa:hasResult': {
                        '@type': 'sosa:hasResult',
                        'Connection': eventData['connection']
                    }
                };
                skeleton['@graph'].push(event);
                pendingEventsForAgencyCounter++;
            }

            // Process the publication of the events, skip publication if no events are available and we already published this information in the previous round
            if(this.previousPublishedEventsCounter[agency] > 0 || pendingEventsForAgencyCounter > 0) {
                let publicationFileStream = fs.createWriteStream(this.eventsStorage + '/' + agency + '/' + this.eventsFileName, { flags:'w' });
                publicationFileStream.write(JSON.stringify(skeleton));
                publicationFileStream.end();
                this.logger.debug(`Publication of ${pendingEventsForAgencyCounter} pending events (${timestamp.toISOString()}.jsonld) successfully for agency: ${agency}`);
	    }
            // Update counter
            this.previousPublishedEventsCounter[agency] = pendingEventsForAgencyCounter;

            // Clean up non-referenced events in previous events list
            this.logger.debug(this.previousEvents[agency].length);
            for(let e=0; e < this.previousEvents[agency].length; e++) {
                if(this.previousEvents[agency][e]['referenced'] > 0) {
		    this.previousEvents[agency][e]['referenced'] = this.previousEvents[agency][e]['referenced'] - 1; // Lower the TTL
                }
		else {
                    this.previousEvents[agency].splice(this.previousEvents[agency].indexOf(e), 1);
		    if(typeof this.previousEvents[agency][e] != 'undefined') {
		    	this.previousEventsIndex[agency].splice(this.previousEventsIndex[agency].indexOf(this.previousEvents[agency][e]['connection']['@id']), 1)
		    }
		}
            }
            this.logger.debug(this.previousEvents[agency].length);
        }
    }

    get pendingEvents() {
        return this._pendingEvents;
    }

    set pendingEvents(pE) {
        this._pendingEvents = pE;
    }

    get previousEventsIndex() {
        return this._previousEventsIndex;
    }

    set previousEventsIndex(pEI) {
        this._previousEventsIndex = pEI;
    }

    get previousPublishedEventsCounter() {
        return this._previousPublishedEventsCounter;
    }

    set previousPublishedEventsCounter(pPEC) {
        this._previousPublishedEventsCounter = pPEC;
    }

    get eventsStorage() {
        return this._eventsStorage;
    }

    get eventsFileName() {
        return this._eventsFileName;
    }

    get logger() {
        return this._logger;
    }

    get agency() {
        return this._agency;
    }

    get previousEvents() {
        return this._previousEvents;
    }
}

module.exports = EventsManager;
