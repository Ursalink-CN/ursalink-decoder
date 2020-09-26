/*

Name:   EM500-SMT.js

Function:
    Decode Ursalink soil-monitoring port 85 messages for TTN console.

Copyright and License:
    See accompanying LICENSE file at https://github.com/mcci-catena/MCCI-Catena-PMS7003/

Author:
    Terry Moore, MCCI Corporation   August 2020

*/

/**
 * Ursalink Sensor Payload Decoder
 *
 * definition [channel-id] [channel-type] [channel-data]
 *
 * 01: battery      -> 0x01 0x75 [1byte]   Unit:%
 * 03: Temperature  -> 0x03 0x67 [2bytes]  Unit:°C
 * 04: Moisture     -> 0x04 0x68 [1byte]   Unit:%RH
 * 05: Conductivity -> 0x05 0x7f [2bytes]  Unit:µs/cm
 * ------------------------------------------ EM500-SMT
 */
function Decoder(bytes, port) {
    var decoded = {};

    // accept either no port at all, or port 85
    if (! (port === undefined || port === 85)) {
        return null;
    }

    decoded.Error = false;
    for (var i = 0; i < bytes.length;) {
        // be robust
        if (i > bytes.length - 2) {
            // out of data.
            decoded.Error = true;
            break;
        }

        var channel_id = bytes[i++];
        var channel_type = bytes[i++];
        // BATTERY
        if (channel_id === 0x01 && channel_type === 0x75) {
            decoded.battery = bytes[i]; 
            i += 1;
        }
        // TEMPERATURE
        else if (channel_id === 0x03 && channel_type === 0x67) {
            decoded.temperature = readInt16LE(bytes.slice(i, i + 2)) / 10;
            i += 2;
        }
        // MOISTURE
        else if (channel_id === 0x04 && channel_type === 0x68) {
            decoded.humidity = bytes[i] / 2;
            i += 1;
        } 
        // Electrical Conductivity
        else if (channel_id === 0x05 && channel_type === 0x7f) {
            decoded.conductivity= readInt16LE(bytes.slice(i, i + 2)) ;
            i += 2;
        }
        // SYSTEM
        else if (channel_id === 0xFF) {
            // FORMAT_VERSION
            if (channel_type === 0x01) {
                decoded.FormatVersion = bytes[i++];
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
            // RESTART
            if (channel_type === 0x0B) {
                decoded.restart = 1;
                ++i;
            }
            // POWER OFF
            if (channel_type === 0x0C) {
                decoded.shutdown = 1;
                ++i;
            }
            // CLASS
            else if (channel_type === 0x0F) {
                decoded.Class = bytes[i++];
            }
            // SERIAL_NUMBER
            else if (channel_type === 0x16) {
                decoded.SerialNumber = readHexBytes(bytes.slice(i, i+6));
                i += 6;
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
