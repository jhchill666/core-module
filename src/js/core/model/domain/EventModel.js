import Incidents from '../Incidents';
import TennisIncidents from '../TennisIncidents';
import EventDataSync from '../EventDataSync';
import cache from '../EventCache';
import {
	EVENT_TRADING_STATE,
	INCIDENTS,
	EVENT,
	DATA_SYNC,
	SUBSCRIBE_RESPONSE,
	SCHEDULE_AMENDMENT,
	ACCOUNT_BALANCE_UPDATE,
	BET_UPDATE,
	CALCULATE_CASHOUT,
} from '../../service/SportsSocketService';



var Model = Marionette.Controller.extend({
	initialize() {
		App.socket.on(EVENT_TRADING_STATE, this.onEventTradingStateChange);
		App.socket.on(INCIDENTS, this.onIncidentsChange);
		App.socket.on(EVENT, this.onEventChange);
		App.socket.on(SUBSCRIBE_RESPONSE, this.onSubscribeResponse);
		App.socket.on(SCHEDULE_AMENDMENT, this.onScheduleAmendmentChange);
		App.socket.on(DATA_SYNC, this.onEventDataSync);
	},

	/**
	 * @param data
	 */
	onEventDataSync: function(data) {
		var eventDataSync;

		var event = cache.getEvent(data.id);
		if (event == null) return;

		if (!event.has('eventDataSync'))
			event.set({eventDataSync: new EventDataSync()});

		eventDataSync = event.get('eventDataSync');
		eventDataSync.parse(data);

		if (event) {
			event.set("numMarkets", data.numMarkets);
			App.vent.trigger('event:numMarkets:change',event);
		}
	},


	/**
	 * @param eventScheduleModel
	 */
	//onInplayScheduleChange: function(eventScheduleModel) {
	//	if (_.has(eventScheduleModel.attributes, 'inplay')) {
	//		for (var i = 0; i < eventScheduleModel.attributes.inplay.length; i++) {
	//			var eventObj = eventScheduleModel.attributes.inplay[i];
	//			if (!this.hasIncidentsForEvent(eventObj.id)) {
	//				this.updateIncidentScoreFromEvent(eventObj);
	//			}
	//		}
	//	}
	//},


	/**
	 * Adds newly inplay events from the ScheduleAdapter to the incident mechanism.
	 * Only currently required/enabled for Pokerstars
	 * @param evts
	 */
	//onScheduleAddInplay: function(evts) {
	//	_.each(evts, function(e) {
	//		if (!this.hasIncidentsForEvent(e.id)) {
	//			this.updateIncidentScoreFromEvent(e);
	//		}
	//	}, this);
	//},


	/**
	 * Set the score from the schedule API.
	 * @param event
	 */
	//updateIncidentScoreFromEvent: function(event) {
	//	var incidentModel = this.getIncidentsForEvent(event.id, event.attributes.code);
	//	var score = event.getInplayScore();
	//	incidentModel.setGoalScore(score);
	//	var participantA = event.getParticipantA();
	//	var participantB = event.getParticipantB();
	//	incidentModel.setParticipants(participantA,participantB);
	//},


	/**
	 * Websocket push messages
	 * @param data
	 */
	onEventTradingStateChange: function(data) {
		if (_.has(data, 'prices')) {
			this.parseEventTradingState(data);
		}
	},


	/**
	 * Websocket push messages
	 * @param data
	 */
	onIncidentsChange: function(data) {
		var incidents = data["new"].incident;
		var eventId = data.id;
		this.parseIncidents(eventId,incidents);
	},

	/**
	 * Websocket push messages
	 * @param data
	 */
	onEventChange: function(data) {
		if (_.has(data, 'id')) {
			var markets = data.market;
			_.each(markets, function(m) {
				console.log("MarketAdded :: "+ m.name);
			});
			var event = cache.getEvent(data.id);
			if (event) {
				this.listenToOnce(event,"change", this.onEventPropertyChange);
				event.set(event.parse(data));

				if (!!event.attributes.hasNewMarkets) {
					this.onEventMarketsChange(event);
				}
			}
		}
	},


	/**
	 * @param event
	 */
	onEventPropertyChange: function(event) {
		var eventChangeObj = {};
		eventChangeObj.id = event.attributes.id;
		eventChangeObj.changed = event.changed;

		App.vent.trigger('event:propertyChange', eventChangeObj);
	},


	/**
	 * @param event
	 */
	onEventMarketsChange: function(event) {
		var eventChangeObj = {};
		eventChangeObj.id = event.attributes.id;
		eventChangeObj.changed = event.changed;

		App.vent.trigger('event:marketChange', eventChangeObj);
	},


	/**
	 * @param data
	 */
	onSubscribeResponse: function(data) {
		var match = data.match || data.matches || [];
		for (var i=0; i< match.length; i++) {
			var matchObj = match[i];
			if (_.has(matchObj, 'matchDetails')) {
				this.parseMatchDetails(matchObj.matchDetails);
			}
			if (_.has(matchObj, 'incidents')) {
				var incidents = matchObj.incidents["new"];
				var eventId = matchObj.incidents.id;
				if (incidents && eventId) {
					if (_.has(matchObj, 'matchDetails')) {
						var sportCode = matchObj.matchDetails.sportcode;
						var incidentModel = this.getIncidentsForEvent(eventId,sportCode);
						if (_.has(matchObj.matchDetails),'attribute') {
							incidentModel.populateInplayAttributes(matchObj.matchDetails);
						}
					}
					this.parseIncidents(eventId, incidents.incident);
					var inplayState = null;
					if (_.has(matchObj.incidents,'inplayState')) {
						inplayState = matchObj.incidents.inplayState;
						//matchTimeInSecs
						//period
					}
				}
			}
			if (_.has(matchObj, 'eventTradingState')) {
				var eventTradingState = matchObj.eventTradingState;
				if (eventTradingState) {
					this.parseEventTradingState(eventTradingState);
				}
			}
		}
	},


	/**
	 * @param eventTradingState
	 */
	parseEventTradingState: function(update) {
		var event = cache.getEvent(update.id);
		if (event) {
			event.update(update);
		}
	},


	/**
	 * @param eventTradingState
	 */

	/**
	 * @param eventId
	 * @param incidents
	 */
	parseIncidents: function(eventId, incidents) {
		var incidentModel = this.getIncidentsForEvent(eventId);
		if (_.isNull(incidentModel) || _.isUndefined(incidentModel)) {
			return;
		}

		var incidentPropertyChanged = false;
		incidentModel.setPropertyChanged(false);
		this.listenTo(incidentModel,"change:type", this.onIncidentTypeChange);
		this.listenTo(incidentModel,"onGoalScoreChange", this.onIncidentGoalScore);

		for (var i=0; i< incidents.length; i++) {
			incidentModel.populate(incidents[i]);
			if (incidentModel.getPropertyChanged()) {
				incidentPropertyChanged = true;
			}
		}

		if (incidentPropertyChanged) {
			App.vent.trigger('incidents:change', incidentModel);
		}
	},


	onIncidentGoalScore: function(incidentModel) {
		//Sync the Event.js inplayAttributes with the new value.
		var event = cache.getEvent(incidentModel.attributes.eventId);
		if (event) {
			event.setInplayScore(incidentModel.getGoalScore());
		}
	},

	onIncidentTypeChange: function(incidentModel) {
		if (this.isIncidentTypeTimerRelated(incidentModel.attributes.type)) {
			App.vent.trigger('incidents:timerChange', incidentModel);
		}

		if(incidentModel.attributes.type == 'PeriodStart')
			App.vent.trigger('incidents:periodStart', incidentModel);
	},

	isIncidentTypeTimerRelated: function(type) {
		if (type == 'ClockChange' || type == 'PeriodStart' || type == 'Finished') {
			return true;
		}
		return false;
	},

	hasIncidentsForEvent: function(eventId) {
		return _.has(this.incidentEventXref, eventId);
	},


	createIncidentModel: function(eventId, sportCode) {
		var lowerSportCode = sportCode.toLowerCase();
		var incidentModel;

		switch(lowerSportCode) {
			case 'soccer':
				incidentModel = new Incidents(eventId);
				//TEMP fix for new Incidents not creating new object in memory?
				incidentModel.resetDefaults();
				break;
			case 'tennis':
				incidentModel = new TennisIncidents(eventId);
				incidentModel.resetDefaults();
				break;
			default:
				incidentModel = new Incidents(eventId);
				break;
		}
		this.incidentEventXref[eventId] = incidentModel;
		return incidentModel;
	},

	getIncidentsForEvent: function(eventId, optionalSportCode) {
		if (this.hasIncidentsForEvent(eventId)) {
			return this.incidentEventXref[eventId];
		}

		var event = cache.getEvent(eventId);
		var incidentModel;

		if (event) {
			incidentModel = this.createIncidentModel(eventId,event.attributes.code);
			var scoreFromSchedule = event.getInplayScore();
			//FIXME CHANGE setGoalScore to generic method implemented by all models.
			incidentModel.setGoalScore(scoreFromSchedule);
		}
		else {
			if ( !_.isUndefined(optionalSportCode) && !_.isNull(optionalSportCode)) {
				incidentModel = this.createIncidentModel(eventId,optionalSportCode);
			}
		}

		this.incidentEventXref[eventId] = incidentModel;
		return this.incidentEventXref[eventId];
	},


	parseMatchDetails: function(matchDetails) {
		if (_.has(matchDetails, 'participants')) {
		    var eventId = matchDetails.matchId;
		    var participantArray = matchDetails.participants.participant;
		    var event = cache.getEvent(eventId);
		    if (event) {
		        event.setParticipants(participantArray);
		    }
		}
	},

	onScheduleAmendmentChange: function(data) {
		var schdl = data.sport;
		if (!data) return;

		// update event cache with new inplay events
		var inplay = _.map(schdl.newInplay.event, function(e) {
			e.inplay = true;
			cache.updateEvent(e); return e.id;
		}, this);

		// update event cache with new prematch events
		var premat = _.map(schdl.newPrematch.event, function(e) {
			e.inplay = false;
			cache.updateEvent(e); return e.id;
		}, this);

		this.noLongerPrematch(schdl.noLongerPrematch, inplay);
		this.noLongerInplay(schdl.noLongerInplay);

		this.newPrematch(premat);
		this.newInplay(schdl.noLongerPrematch, inplay);
	},


	/**
	 * was prematch, but not now inplay - 'schedule:remove'
	 * @param oldPrematch
	 * @param inplay
	 */
	noLongerPrematch: function(oldPrematch, inplay) {
		var ids = _.difference(oldPrematch, inplay);
		if (!!ids.length)
			App.bus.trigger('schedule:remove:prematch', ids);
	},


	/**
	 * was inplay, but no longer - 'schedule:remove'
	 */
	noLongerInplay: function(oldInplay) {
		var ids = _.reduce(oldInplay, function(memo, e) {
			var event = cache.getEvent(e.id);
			if (event) {
				event.set({inplay: false});
				memo.push(event.id);
			}
			return memo;
		}, [], this);

		if (!!ids.length)
			App.bus.trigger('schedule:remove:inplay', ids);
	},


	/**
	 *
	 * @param oldInplay
	 */
	newPrematch: function(prematch) {
		if (!!prematch.length)
			App.bus.trigger('schedule:add:prematch', prematch);
	},


	/**
	 * was prematch, now inplay - 'schedule:add:inplay'. id
	 * should be present in 'noLongerPrematch' and 'newInplay'
	 */
	newInplay: function(oldPrematch, inplay) {
		if (!!inplay.length)
			App.bus.trigger('schedule:add:inplay', inplay);
	}
});


let inst = new Model();
export default inst;
