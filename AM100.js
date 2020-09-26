/*

Name:   AM100.js

Function:
    Decode Ursalink port 85 messages for TTN console.

Copyright and License:
    See accompanying LICENSE file at https://github.com/mcci-catena/MCCI-Catena-PMS7003/

Author:
    Terry Moore, MCCI Corporation   August 2020

*/

/**
 * Ursalink AM100 / AM102 Payload Decoder
 *
 * definition [channel-id] [channel-type] [channel-data]
 *
 * 01: battery      -> 0x01 0x75 [1byte]  Unit: %
 * 03: temperature  -> 0x03 0x67 [2bytes] Unit: °C
 * 04: humidity     -> 0x04 0x68 [1byte]  Unit: %
 * 05: PIR          -> 0x05 0x6A [2bytes] 
 * 06: illumination -> 0x06 0x65 [6bytes] Unit: lux
 * ------------------------------------------ AM100
 * 07: CO2          -> 0x07 0x7D [2bytes] Unit: ppm
 * 08: TVOC         -> 0x08 0x7D [2bytes] Unit: ppb
 * 09: Pressure     -> 0x09 0x73 [2bytes] Unit: hPa
 * ------------------------------------------ AM102
 */
function Decoder(bytes, port) {
    var decoded = {};

    // accept either no port at all, or port 85
    if (! (port === undefined || port === 85)) {
        return null;
    }

    decoded.Error = false;
    for (var i = 0; i < bytes.length;) {
        var channel_id = bytes[i++];
        var channel_type = bytes[i++];
        // BATTERY
        if (channel_id === 0x01 && channel_type === 0x75) {
            decoded.battery = bytes[i];
            if (decoded.battery > 100)
                decoded.battery = 100;
            i += 1;
        }
        // TEMPERATURE
        else if (channel_id === 0x03 && channel_type === 0x67) {
            decoded.temperature = readInt16LE(bytes.slice(i, i + 2)) / 10;
            i += 2;
        }
        // HUMIDITY
        else if (channel_id === 0x04 && channel_type === 0x68) {
            decoded.humidity = bytes[i] / 2;
            i += 1;
        }
        // PIR
        else if (channel_id === 0x05 && channel_type === 0x6A) {
            decoded.activity = readInt16LE(bytes.slice(i, i + 2));
            i += 2;
        }
        // LIGHT
        else if (channel_id === 0x06 && channel_type === 0x65) {
            decoded.illumination = readInt16LE(bytes.slice(i, i+2));
           // decoded.infrared_and_visible = readInt16LE(bytes.slice(i + 2, i + 4));
           // decoded.infrared = readInt16LE(bytes.slice(i + 4, i + 6));
            i += 6;
        }
        // CO2
        else if (channel_id === 0x07 && channel_type === 0x7D) {
            decoded.co2 = readInt16LE(bytes.slice(i, i + 2));
            i += 2;
        }
        // TVOC
        else if (channel_id === 0x08 && channel_type === 0x7D) {
            decoded.tvoc = readInt16LE(bytes.slice(i, i + 2));
            i += 2;
        }
        // PRESSURE
        else if (channel_id === 0x09 && channel_type === 0x73) {
            decoded.pressure = readInt16LE(bytes.slice(i, i + 2))/10;
            i += 2;
        }
        // SYSTEM
        else if (channel_id === 0xFF) {
            // RESTART
            if (channel_type === 0x0B) {
                decoded.restart = 1;
                ++i;
            }
            // FORMAT_VERSION
            else if (channel_type === 0x01) {
                decoded.FormatVersion = bytes[i++];
            }
            // SERIAL_NUMBER
            else if (channel_type === 0x08) {
                decoded.SerialNumber = readHexBytes(bytes.slice(i, i+6));
                i += 6;
            }
            // HARDWARE_VERSION
            else if (channel_type === 0x09) {
                decoded.HardwareVersion = readVersion(bytes.slice(i, i+2));
                i += 2;
            }
            // SOFTWARE_VERSION
            else if (channel_type === 0x0A) {
                decoded.SoftwareVersion = readVersion(bytes.slice(i, i+2));
                i += 2;
            }
            // CLASS
            else if (channel_type === 0x0F) {
                decoded.Class = bytes[i++];
            }
            // Something else
            else if (channel_type === 0x18) {
                var enabledSensors = readUInt16BE(bytes.slice(i, i+2));
                i += 2;
                decoded.EnabledSensors = {
                    temperature : (enabledSensors & 0x01) !== 0, 
                    humidity    : (enabledSensors & 0x02) !== 0, 
                    activity    : (enabledSensors & 0x04) !== 0, 
                    illumination: (enabledSensors & 0x08) !== 0, 
                    co2         : (enabledSensors & 0x10) !== 0, 
                    tvoc        : (enabledSensors & 0x20) !== 0, 
                    pressure    : (enabledSensors & 0x40) !== 0, 
                    };
            } else {
                decoded.Error = true;
                break;
            }
        } else {
            decoded.error = true;
            break;
        }
    }
    return decoded;
}

/* ******************************************
 * bytes to number
 ********************************************/
function readUInt16LE(bytes) {
    var value = (bytes[1] << 8) + bytes[0];
    return value & 0xffff;
}

function readInt16LE(bytes) {
    var ref = readUInt16LE(bytes);
    return ref > 0x7fff ? ref - 0x10000 : ref;
}

function readUInt16BE(bytes) {
    var value = (bytes[0] << 8) + bytes[1];
    return value;
}

function bcd2ToDecimal(value) {
    var result = value & 0xF;
    if (result > 9 || value >= 0xA0) {
        return 0;
    } 
    return result + 10 * (value >> 4);
}

function bcd22ToVersion(value) {
    var result = bcd2ToDecimal(value >> 8) + (bcd2ToDecimal(value & 0xFF) / 100);
    return result;
}

function readVersion(bytes) {
    return bcd22ToVersion(readUInt16BE(bytes));
}

function encodeHex(byte) {
    return ("0" + byte.toString(16)).substr(-2);
}

function readHexBytes(bytes) {
    var result = "";
    for (var i = 0; i < bytes.length; ++i) {
        result = result + "-" + encodeHex(bytes[i]);
    }
    return result.substr(1);
}