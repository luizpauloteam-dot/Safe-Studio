const { EventEmitter } = require('events');

const TEBEX_EVENTS = {
  PAYMENT_COMPLETED: 'tebex:payment-completed',
};

const tebexEvents = new EventEmitter();

module.exports = {
  TEBEX_EVENTS,
  tebexEvents,
};
