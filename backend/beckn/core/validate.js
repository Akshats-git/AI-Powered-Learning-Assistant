// Schema validation against the pinned specification.
//
// `spec/beckn.yaml` is beckn/protocol-specifications-v2 at v2.0.0 LTS, vendored
// rather than fetched so a network blip can never change what "valid" means and
// so the version this code was written against stays legible in git.
//
// Validating against the real document, instead of a hand-written idea of it,
// is what catches the differences that matter: v2 has no `context.domain`,
// carries `bapId`/`bppId` alongside the DID-based `senderId`/`receiverId`,
// answers discovery with `catalogs` (plural), and calls the thing you order a
// Contract rather than an Order. Every one of those was wrong in this
// implementation before the schema was wired up.
//
// OpenAPI 3.1.1 uses JSON Schema 2020-12 verbatim, so Ajv validates the
// component schemas directly with no translation step.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { load as parseYaml } from "js-yaml";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const SPEC_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "spec", "beckn.yaml");

export const spec = parseYaml(fs.readFileSync(SPEC_PATH, "utf8"));
export const SPEC_VERSION = spec.info.version;

// strict:false — the specification carries OpenAPI annotations (`example`,
// `x-tags`) that are not JSON Schema keywords. They are documentation, not
// constraints, and rejecting the document over them would be absurd.
const ajv = new Ajv2020({ strict: false, allErrors: true, validateFormats: true });
addFormats(ajv);
ajv.addSchema({ $id: "beckn", components: spec.components });

// $refs inside the document are written as `#/components/schemas/X`, which
// resolves against the registered document rather than against a bare schema.
const componentRef = (name) => ({ $ref: `beckn#/components/schemas/${name}` });

const compiled = new Map();
const validatorFor = (name) => {
  if (!compiled.has(name)) compiled.set(name, ajv.compile(componentRef(name)));
  return compiled.get(name);
};

const formatErrors = (errors) =>
  (errors || []).map((e) => `${e.instancePath || "(root)"} ${e.message}`).join("; ");

/**
 * @returns { valid, errors } — errors is a readable string, not Ajv's array,
 *   because it ends up in a NACK's error.message where a human reads it.
 */
export const validateComponent = (name, value) => {
  const validate = validatorFor(name);
  return { valid: validate(value), errors: formatErrors(validate.errors) };
};

// The message schema each action carries, from the paths section of the spec.
const ACTION_MESSAGE_SCHEMAS = {
  discover: "DiscoverAction",
  on_discover: "OnDiscoverAction",
  select: "SelectAction",
  on_select: "OnSelectAction",
  init: "InitAction",
  on_init: "OnInitAction",
  confirm: "ConfirmAction",
  on_confirm: "OnConfirmAction",
  status: "StatusAction",
  on_status: "OnStatusAction",
};

export const ACTIONS = Object.keys(ACTION_MESSAGE_SCHEMAS);

export const validateContext = (context) => validateComponent("Context", context);

export const validateMessage = (action, message) => {
  const schema = ACTION_MESSAGE_SCHEMAS[action];
  if (!schema) return { valid: false, errors: `no message schema for action "${action}"` };
  return validateComponent(schema, message);
};

/** Validates a whole request or callback body — context and message together. */
export const validatePayload = (action, payload) => {
  const context = validateContext(payload?.context);
  if (!context.valid) return { valid: false, errors: `context: ${context.errors}` };

  const message = validateMessage(action, payload?.message);
  if (!message.valid) return { valid: false, errors: `message: ${message.errors}` };

  return { valid: true, errors: "" };
};
