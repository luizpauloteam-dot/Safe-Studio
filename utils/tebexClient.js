const axios = require('axios');
const config = require('../config');

const API_TIMEOUT_MS = Number.parseInt(process.env.TEBEX_API_TIMEOUT_MS || '10000', 10);

const tebexHttp = axios.create({
  baseURL: 'https://headless.tebex.io/api',
  timeout: Number.isFinite(API_TIMEOUT_MS) ? API_TIMEOUT_MS : 10000,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'safe-studio-tebex/1.0',
  },
});

function getPublicToken() {
  return String(config.tebex?.publicToken || '').trim();
}

function getPrivateKey() {
  return String(config.tebex?.privateKey || '').trim();
}

function ensurePublicToken() {
  const token = getPublicToken();

  if (!token) {
    const error = new Error('TEBEX_PUBLIC_TOKEN is not configured.');
    error.statusCode = 500;
    throw error;
  }

  return token;
}

function buildRequestHeaders() {
  const privateKey = getPrivateKey();

  if (!privateKey) return {};

  const username = ensurePublicToken();
  const basic = Buffer.from(`${username}:${privateKey}`, 'utf8').toString('base64');

  return {
    Authorization: `Basic ${basic}`,
  };
}

function unwrapResponseData(response) {
  return response?.data?.data ?? response?.data ?? null;
}

function normalizeHttpError(error) {
  if (!error?.response) return error;

  const statusCode = error.response.status || 500;
  const details = error.response.data || null;

  const nextError = new Error(
    details?.message
      || details?.error
      || `Tebex API request failed with status ${statusCode}`,
  );

  nextError.statusCode = statusCode;
  nextError.details = details;

  return nextError;
}

async function getCategories(options = {}) {
  const token = ensurePublicToken();
  const includePackages = options.includePackages ?? 1;

  try {
    const response = await tebexHttp.get(`/accounts/${token}/categories`, {
      params: {
        includePackages,
      },
      headers: buildRequestHeaders(),
    });

    return unwrapResponseData(response);
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function getPackages() {
  const token = ensurePublicToken();

  try {
    const response = await tebexHttp.get(`/accounts/${token}/packages`, {
      headers: buildRequestHeaders(),
    });
    return unwrapResponseData(response);
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function createBasket(payload = {}) {
  const token = ensurePublicToken();

  try {
    const response = await tebexHttp.post(`/accounts/${token}/baskets`, payload, {
      headers: buildRequestHeaders(),
    });
    return unwrapResponseData(response);
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function getBasket(basketIdent) {
  const token = ensurePublicToken();

  if (!basketIdent) {
    const error = new Error('basketIdent is required.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const encodedIdent = encodeURIComponent(String(basketIdent));
    const response = await tebexHttp.get(`/accounts/${token}/baskets/${encodedIdent}`, {
      headers: buildRequestHeaders(),
    });
    return unwrapResponseData(response);
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function addPackageToBasket(basketIdent, payload = {}) {
  if (!basketIdent) {
    const error = new Error('basketIdent is required.');
    error.statusCode = 400;
    throw error;
  }

  try {
    const encodedIdent = encodeURIComponent(String(basketIdent));
    const response = await tebexHttp.post(`/baskets/${encodedIdent}/packages`, payload, {
      headers: buildRequestHeaders(),
    });
    return unwrapResponseData(response);
  } catch (error) {
    throw normalizeHttpError(error);
  }
}

async function createCheckoutForPackage(options = {}) {
  const packageId = options.packageId || options.package_id;

  if (!packageId) {
    const error = new Error('package_id is required to create a checkout.');
    error.statusCode = 400;
    throw error;
  }

  const basket = await createBasket({
    complete_url: options.complete_url,
    cancel_url: options.cancel_url,
    custom: options.custom,
  });

  const basketIdent = basket?.ident || basket?.id;

  if (!basketIdent) {
    const error = new Error('Tebex did not return a basket identifier.');
    error.statusCode = 502;
    throw error;
  }

  await addPackageToBasket(basketIdent, {
    package_id: packageId,
    quantity: options.quantity || 1,
    variable_data: options.variable_data,
  });

  const freshBasket = await getBasket(basketIdent);

  return {
    basket: freshBasket,
    basketIdent,
    checkoutUrl: freshBasket?.links?.checkout || null,
  };
}

module.exports = {
  addPackageToBasket,
  createBasket,
  createCheckoutForPackage,
  getBasket,
  getCategories,
  getPackages,
};
