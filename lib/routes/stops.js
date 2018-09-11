const N3 = require('n3');
const { DataFactory } = N3;
const { namedNode, literal, quad } = DataFactory;
const util = require('util');
const Logger = require('../utils/logger');
const express = require('express');
const fs = require('fs');
const request = require('request');
const router = express.Router();
var utils = require('../utils/utils');
const writeFile = util.promisify(fs.writeFile);
const readFile = util.promisify(fs.readFile);

const storage = utils.datasetsConfig.storage;
const server_config = utils.serverConfig;
const logger = Logger.getLogger(server_config.logLevel || 'info');

const delijnStopNames = { "Antwerpen": 1, "Oost-Vlaanderen": 2, "Vlaams-Brabant": 3, "Limburg": 4, "West-Vlaanderen": 5 };
const delijnStopIds = { "1": "Antwerpen", "2": "Oost-Vlaanderen", "3": "Vlaams-Brabant", "4": "Limburg", "5": "West-Vlaanderen" };

class Stops {
    async getDelijnStopsByZone(req, res) {
        res.set({ 'Access-Control-Allow-Origin': '*' });
        try {
            let zone = req.params.zone;
            let now = new Date();

            if (!fs.existsSync(storage + '/datasets/delijn/stops')) {
                await this.mapDelijnStops();
            }

            if(delijnStopNames[zone]) {
                let stops = JSON.parse(await readFile(storage + '/datasets/delijn/stops/' + delijnStopNames[zone] + '.jsonld', { encoding: 'utf8' }));
                res.set({ 'Cache-control': 'public, max-age=31536000000, immutable' });
                res.set({ 'Expires': new Date(now.getTime() + 31536000000).toUTCString() });
                res.json(stops);
            } else {
                throw new Error('Undefined requested zone.');
            }
        } catch (err) {
            logger.error(err);
            res.status(404).send(err.message);
        }
    }

    async mapDelijnStops() {
        fs.mkdirSync(storage + '/datasets/delijn/stops');
        let zones = [1, 2, 3, 4, 5];

        await Promise.all(zones.map(async zone => {
            let jsonld = {
                "@context": {
                    "schema": "http://schema.org/",
                    "name": "http://xmlns.com/foaf/0.1/name",
                    "longitude": "http://www.w3.org/2003/01/geo/wgs84_pos#long",
                    "latitude": "http://www.w3.org/2003/01/geo/wgs84_pos#lat",
                    "alternative": "http://purl.org/dc/terms/alternative",
                    "avgStopTimes": "http://semweb.mmlab.be/ns/stoptimes#avgStopTimes",
                    "country": {
                        "@type": "@id",
                        "@id": "http://www.geonames.org/ontology#parentCountry"
                    },
                    "operationZone": {
                        "@type": "@id",
                        "@id": "schema:areaServed"
                    }
                },

                "@graph": []
            };

            let rawStops = (await this.getStopsFromDelijnAPI(zone)).haltes;
            for (let s in rawStops) {

                jsonld['@graph'].push({
                    "@id": "https://data.delijn.be/stops/" + rawStops[s]['haltenummer'],
                    "country": "http://sws.geonames.org/2802361",
                    "latitude": rawStops[s]['geoCoordinaat']['latitude'],
                    "longitude": rawStops[s]['geoCoordinaat']['longitude'],
                    "name": rawStops[s]['omschrijving'],
                    "operationZone": "https://data.delijn.be/entiteit/" + delijnStopIds[zone]
                });
            }

            await writeFile(storage + '/datasets/delijn/stops/' + zone + '.jsonld', JSON.stringify(jsonld), 'utf8');
        }));
    }

    getStopsFromDelijnAPI(zone) {
        return new Promise((resolve, reject) => {
            let uri = 'https://api.delijn.be/DLKernOpenData/v1/beta/entiteiten/' + zone + '/haltes'
    
            let options = {
                url: uri,
                headers: { 'Ocp-Apim-Subscription-Key': '32654c63bee6428fab855c1e7027d156' }
            };
    
            request(options, (error, res, body) => {
                if (error) {
                    reject(error);
                } else {
                    resolve(JSON.parse(body));
                }
            });
        });
    }
}

module.exports = Stops;

