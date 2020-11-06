//
// Module:  AM100-node-red.js
//
// Function:
//      This Node-RED decoding function decodes the record sent by the Ursalink
//      AM102 sensor
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

Name:   CalculateHeatIndex()

Description:
        Calculate the NWS heat index given dry-bulb T and RH

Definition:
        function CalculateHeatIndex(t, rh) -> value or null

Description:
        T is a Farentheit temperature in [76,120]; rh is a
        relative humidity in [0,100]. The heat index is computed
        and returned; or an error is returned.

Returns:
        number => heat index in Farenheit.
        null => error.

References:
        https://github.com/mcci-catena/heat-index/
        https://www.wpc.ncep.noaa.gov/html/heatindex_equation.shtml

        Results was checked against the full chart at iweathernet.com:
        https://www.iweathernet.com/wxnetcms/wp-content/uploads/2015/07/heat-index-chart-relative-humidity-2.png

        The MCCI-Catena heat-index site has a test js script to generate CSV to
        match the chart, a spreadsheet that recreates the chart, and a
        spreadsheet that compares results.

*/

function CalculateHeatIndex(t, rh) {
    var tRounded = Math.floor(t + 0.5);

    // return null outside the specified range of input parameters
    if (tRounded < 76 || tRounded > 126)
        return null;
    if (rh < 0 || rh > 100)
        return null;

    // according to the NWS, we try this first, and use it if we can
    var tHeatEasy = 0.5 * (t + 61.0 + ((t - 68.0) * 1.2) + (rh * 0.094));

    // The NWS says we use tHeatEasy if (tHeatHeasy + t)/2 < 80.0
    // This is the same computation:
    if ((tHeatEasy + t) < 160.0)
            return tHeatEasy;

    // need to use the hard form, and possibly adjust.
    var t2 = t * t;         // t squared
    var rh2 = rh * rh;      // rh squared
    var tResult =
        -42.379 +
        (2.04901523 * t) +
        (10.14333127 * rh) +
        (-0.22475541 * t * rh) +
        (-0.00683783 * t2) +
        (-0.05481717 * rh2) +
        (0.00122874 * t2 * rh) +
        (0.00085282 * t * rh2) +
        (-0.00000199 * t2 * rh2);

    // these adjustments come from the NWA page, and are needed to
    // match the reference table.
    var tAdjust;
    if (rh < 13.0 && 80.0 <= t && t <= 112.0)
        tAdjust = -((13.0 - rh) / 4.0) * Math.sqrt((17.0 - Math.abs(t - 95.0)) / 17.0);
    else if (rh > 85.0 && 80.0 <= t && t <= 87.0)
        tAdjust = ((rh - 85.0) / 10.0) * ((87.0 - t) / 5.0);
    else
        tAdjust = 0;

    // apply the adjustment
    tResult += tAdjust;

    // finally, the reference tables have no data above 183 (rounded),
    // so filter out answers that we have no way to vouch for.
    if (tResult >= 183.5)
        return null;
    else
        return tResult;
}

function CalculateHeatIndexCelsius(t, rh) {
    var result = CalculateHeatIndex(t, rh);
    if (result !== null) {
        // convert to celsius.
        result = (result - 32) * 5 / 9;
    }
    return result;
}
//--- end of MCCI heat index calculator ---
// begin AM100.js
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
            decoded.activity = readUInt16LE(bytes.slice(i, i + 2));
            i += 2;
        }
        // LIGHT
        else if (channel_id === 0x06 && channel_type === 0x65) {
            decoded.illumination = readUInt16LE(bytes.slice(i, i+2));
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
            decoded.tvoc = readUInt16LE(bytes.slice(i, i + 2));
            i += 2;
        }
        // PRESSURE
        else if (channel_id === 0x09 && channel_type === 0x73) {
            decoded.pressure = readUInt16LE(bytes.slice(i, i + 2))/10;
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

if ("temperature" in result && "humidity" in result)
    {
    result.tDewC = dewpoint(result.temperature, result.humidity);
    result.tHeatIndexC = CalculateHeatIndexCelsius(result.temperature, result.humidity);
    }

// now update msg with the new payload and new .local field
// the old msg.payload is overwritten.
msg.payload = result;
msg.local =
    {
        nodeType: "Ursalink AM102",
        platformType: "Urasalink AM100",
        radioType: "Ursalink",
        applicationName: "Ambience Monitor"
    };

return msg;
