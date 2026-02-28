"use strict";

const nock = require("nock");

const { DOCUMENTSERVER_URL } = require("../../helpers/vars");

const mockDiscoveryXml = `<?xml version="1.0" encoding="UTF-8"?>
<wopi-discovery>
  <net-zone app="text/plain">
    <action ext="txt" urlsrc="https://collabora.example.com/loleaflet/55a868ef8b/lool/ws/convert-to/txt" name="view"/>
    <action ext="txt" urlsrc="https://collabora.example.com/loleaflet/55a868ef8b/lool/ws/convert-to/txt" name="edit"/>
  </net-zone>
  <net-zone app="text/html">
    <action ext="html" urlsrc="https://collabora.example.com/loleaflet/55a868ef8b/lool/ws/convert-to/html" name="view"/>
    <action ext="html" urlsrc="https://collabora.example.com/loleaflet/55a868ef8b/lool/ws/convert-to/html" name="edit"/>
  </net-zone>
  <net-zone app="application/vnd.oasis.opendocument.text">
    <action ext="odt" urlsrc="https://collabora.example.com/loleaflet/55a868ef8b/lool/ws/convert-to/odt" name="view"/>
    <action ext="odt" urlsrc="https://collabora.example.com/loleaflet/55a868ef8b/lool/ws/convert-to/odt" name="edit"/>
  </net-zone>
  <net-zone app="Settings">
    <action ext="xcu" urlsrc="https://collabora.example.com/loleaflet/55a868ef8b/lool/ws/convert-to/xcu" name="view"/>
  </net-zone>
</wopi-discovery>`;

const collaboraUrl = "https://collabora.example.com/loleaflet/55a868ef8b/lool/ws";
const settingsUrl = "https://collabora.example.com/loleaflet/55a868ef8b/lool/ws/settings";

function setupCollaboraMocks() {
  nock(DOCUMENTSERVER_URL)
    .persist()
    .get("/hosting/discovery")
    .reply(200, mockDiscoveryXml, { "Content-Type": "application/xml" });
}

function getCollaboraUrl() {
  return collaboraUrl;
}

function getSettingsUrl() {
  return settingsUrl;
}

module.exports = {
  setupCollaboraMocks,
  getCollaboraUrl,
  getSettingsUrl,
};
