const axios = require('axios');
const config = require('../config');

const API_TIMEOUT_MS = Number.parseInt(
  process.env.TEBEX_PLUGIN_API_TIMEOUT_MS || process.env.TEBEX_API_TIMEOUT_MS || '10000',
  10,
);

const tebexPluginHttp = axios.create({
  baseURL: 'https://plugin.tebex.io',
  timeout: Number.isFinite(API_TIMEOUT_MS) ? API_TIMEOUT_MS : 10000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'safe-studio-tebex-plugin/1.0',
  },
});

function getPluginSecret() {
  return String(config.tebex?.pluginSecret || '').trim();
}

function ensurePluginSecret() {
  const secret = getPluginSecret();

  if (!secret) {
    const error = new Error('TEBEX_PLUGIN_SECRET is not configured.');
    error.statusCode = 500;
    throw error;
  }

  return secret;
}

function buildHeaders() {
  return {
    'X-Tebex-Secret': ensurePluginSecret(),
  };
}

function normalizeHttpError(error) {
  if (!error?.response) return error;

  const statusCode = error.response.status || 500;
  const details = error.response.data || null;
  const nextError = new Error(
    details?.message
      || details?.error
      || `Tebex plugin API request failed with status ${statusCode}`,
  );

  nextError.statusCode = statusCode;
  nextError.details = details;

  return nextError;
}

async function getPayment(transactionId) {
  if (!transactionId) {
    const error = new Error('transactionId is required.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const encodedTransactionId = encodeURIComponent(String(transactionId).trim());
    const response = await tebexPluginHttp.get(`/payments/${encodedTransactionId}`, {
      headers: buildHeaders(),
    });

    return response.data;
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function getStorePackages() {
  try {
    const response = await tebexPluginHttp.get('/packages', {
      headers: buildHeaders(),
    });

    return response.data;
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function getUserByUsername(username) {
  if (!username) {
    const error = new Error('username is required.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const encodedUsername = encodeURIComponent(String(username).trim());
    const response = await tebexPluginHttp.get(`/user/${encodedUsername}`, {
      headers: buildHeaders(),
    });

    return response.data;
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function updateStorePackage(packageId, payload = {}) {
  if (!packageId && packageId !== 0) {
    const error = new Error('packageId is required.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const encodedPackageId = encodeURIComponent(String(packageId).trim());
    const response = await tebexPluginHttp.put(`/package/${encodedPackageId}`, payload, {
      headers: buildHeaders(),
    });

    return response.data || null;
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function createCheckout(payload = {}) {
  try {
    const response = await tebexPluginHttp.post('/checkout', payload, {
      headers: buildHeaders(),
    });

    return response.data;
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function listPayments(options = {}) {
  const paged = Number.parseInt(options.paged ?? 1, 10);

  try {
    const response = await tebexPluginHttp.get('/payments', {
      params: {
        paged: Number.isFinite(paged) && paged > 0 ? paged : 1,
      },
      headers: buildHeaders(),
    });

    return response.data;
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

module.exports = {
  createCheckout,
  getPayment,
  getStorePackages,
  getUserByUsername,
  listPayments,
  updateStorePackage,
};
