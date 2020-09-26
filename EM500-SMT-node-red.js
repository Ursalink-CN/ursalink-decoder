//
// Module:  EMT500-SMT-node-red.js
//
// Function:
//      This Node-RED decoding function decodes the record sent by the Ursalink
//      EMT500-SMT sensor
//
// License:
//      Copyright (C) 2020, MCCI Corporation.
//      See LICENSE in accompanying git repository.
//

// calculate dewpoint (degrees C) given temperature (C) and relative humidity (0..100)
// from http://andrew.rsmas.miami.edu/bmcnoldy/Humidity.html
// rearranged for efficiency and to deal sanely with very low (< 1%) RH
function dewpoint(t, rh) {
	var c1 = 243.04;
	var c2 = 17.625;
	var h = rh / 100;
	if (h <= 0.01)
	    h = 0.01;
	else if (h > 1.0)
	    h = 1.0;
    
	var lnh = Math.log(h);
	var tpc1 = t + c1;
	var txc2 = t * c2;
	var txc2_tpc1 = txc2 / tpc1;
    
	var tdew = c1 * (lnh + txc2_tpc1) / (c2 - lnh - txc2_tpc1);
	return tdew;
    }
    
/*

Name:   EM500-SMT.js

Function:
    Decode Ursalink soil-monitoring port 85 messages for TTN console.

Copyright and License:
    See accompanying LICENSE file at https://github.com/mcci-catena/MCCI-Catena-PMS7003/

Author:
    Terry Moore, MCCI Corporation   September 2020

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
/*

Node-RED function body.

Input:
    msg     the object to be decoded.

            msg.payload_raw is taken
            as the raw payload if present; otheriwse msg.payload
            is taken to be a raw payload.

            msg.port is taken to be the LoRaWAN port nubmer.


Returns:
    This function returns a message body. It's a mutation of the
    input msg; msg.payload is changed to the decoded data, and
    msg.local is set to additional application-specific information.

*/

var b;

if ("payload_raw" in msg) {
    // the console already decoded this
    b = msg.payload_raw;  // pick up data for convenience
    // msg.payload_fields still has the decoded data
}
else {
    // no console debug
    b = msg.payload;  // pick up data for conveneince
}

var result = Decoder(b, msg.port);

// dewpoint might be interesting, so compute and store it.
if ("temperature" in result && "humidity" in result)
    {
    result.tDewC = dewpoint(result.temperature, result.humidity);
    }

// now update msg with the new payload and new .local field
// the old msg.payload is overwritten.
msg.payload = result;
msg.local =
    {
        nodeType: "Ursalink EM500-SMT",
        platformType: "Urasalink EM500",
        radioType: "Ursalink",
        applicationName: "Soil Monitor"
    };

return msg;
