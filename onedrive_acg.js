async function login() {
  urlNavigate = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" +
        "client_id=481cb65a-d648-4a1d-90fa-405b14d12995" +
        "&response_type=code" +
        "&scope=openid" + // add other scopes
        "&response_mode=fragment" +
        "&prompt=login";

  popUpWidth = 483;
  popUpHeight = 600;
  let popUpWindow = openPopup(urlNavigate, "msal", popUpWidth, popUpHeight);

  try{
    loadFrameTimeout = 6000;
    const hash = await monitorWindowForHash(popUpWindow, loadFrameTimeout, urlNavigate);
    console.log(deserialize(hash));
  } catch (error) {
    console.log(error);
  }
  popUpWindow.close();
}

function openPopup(urlNavigate, title, popUpWidth, popUpHeight) {
  /**
   * adding winLeft and winTop to account for dual monitor
   * using screenLeft and screenTop for IE8 and earlier
   */
  const winLeft = window.screenLeft ? window.screenLeft : window.screenX;
  const winTop = window.screenTop ? window.screenTop : window.screenY;
  /**
   * window.innerWidth displays browser window"s height and width excluding toolbars
   * using document.documentElement.clientWidth for IE8 and earlier
   */
  const width = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  const height = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
  const left = ((width / 2) - (popUpWidth / 2)) + winLeft;
  const top = ((height / 2) - (popUpHeight / 2)) + winTop;

  // open the window
  const popupWindow = window.open(urlNavigate, title, "width=" + popUpWidth + ", height=" + popUpHeight + ", top=" + top + ", left=" + left);

  if (popupWindow.focus) {
    popupWindow.focus();
  }

  return popupWindow;
}

function createNewGuid() {
  /*
   * RFC4122: The version 4 UUID is meant for generating UUIDs from truly-random or
   * pseudo-random numbers.
   * The algorithm is as follows:
   *     Set the two most significant bits (bits 6 and 7) of the
   *        clock_seq_hi_and_reserved to zero and one, respectively.
   *     Set the four most significant bits (bits 12 through 15) of the
   *        time_hi_and_version field to the 4-bit version number from
   *        Section 4.1.3. Version4
   *     Set all the other bits to randomly (or pseudo-randomly) chosen
   *     values.
   * UUID                   = time-low "-" time-mid "-"time-high-and-version "-"clock-seq-reserved and low(2hexOctet)"-" node
   * time-low               = 4hexOctet
   * time-mid               = 2hexOctet
   * time-high-and-version  = 2hexOctet
   * clock-seq-and-reserved = hexOctet:
   * clock-seq-low          = hexOctet
   * node                   = 6hexOctet
   * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
   * y could be 1000, 1001, 1010, 1011 since most significant two bits needs to be 10
   * y values are 8, 9, A, B
   */

  const cryptoObj = window.crypto; // for IE 11
  if (cryptoObj && cryptoObj.getRandomValues) {
    const buffer = new Uint8Array(16);
    cryptoObj.getRandomValues(buffer);

    // buffer[6] and buffer[7] represents the time_hi_and_version field. We will set the four most significant bits (4 through 7) of buffer[6] to represent decimal number 4 (UUID version number).
    buffer[6] |= 0x40; // buffer[6] | 01000000 will set the 6 bit to 1.
    buffer[6] &= 0x4f; // buffer[6] & 01001111 will set the 4, 5, and 7 bit to 0 such that bits 4-7 == 0100 = "4".

    // buffer[8] represents the clock_seq_hi_and_reserved field. We will set the two most significant bits (6 and 7) of the clock_seq_hi_and_reserved to zero and one, respectively.
    buffer[8] |= 0x80; // buffer[8] | 10000000 will set the 7 bit to 1.
    buffer[8] &= 0xbf; // buffer[8] & 10111111 will set the 6 bit to 0.

    return decimalToHex(buffer[0]) + decimalToHex(buffer[1])
      + decimalToHex(buffer[2]) + decimalToHex(buffer[3])
      + "-" + decimalToHex(buffer[4]) + decimalToHex(buffer[5])
      + "-" + decimalToHex(buffer[6]) + decimalToHex(buffer[7])
      + "-" + decimalToHex(buffer[8]) + decimalToHex(buffer[9])
      + "-" + decimalToHex(buffer[10]) + decimalToHex(buffer[11])
      + decimalToHex(buffer[12]) + decimalToHex(buffer[13])
      + decimalToHex(buffer[14]) + decimalToHex(buffer[15]);
  }
  else {
    const guidHolder = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    const hex = "0123456789abcdef";
    let r = 0;
    let guidResponse = "";
    for (let i = 0; i < 36; i++) {
      if (guidHolder[i] !== "-" && guidHolder[i] !== "4") {
        // each x and y needs to be random
        r = Math.random() * 16 | 0;
      }
      if (guidHolder[i] === "x") {
        guidResponse += hex[r];
      } else if (guidHolder[i] === "y") {
        // clock-seq-and-reserved first hex is filtered and remaining hex values are random
        r &= 0x3; // bit and with 0011 to set pos 2 to zero ?0??
        r |= 0x8; // set pos 3 to 1 as 1???
        guidResponse += hex[r];
      } else {
        guidResponse += guidHolder[i];
      }
    }
    return guidResponse;
  }
}

function decimalToHex(num) {
  let hex = num.toString(16);
  while (hex.length < 2) {
    hex = "0" + hex;
  }
  return hex;
}

function monitorWindowForHash(contentWindow, timeout, urlNavigate) {
  POLLING_INTERVAL_MS = 50;
  return new Promise((resolve, reject) => {
    const maxTicks = timeout / POLLING_INTERVAL_MS;
    let ticks = 0;

    const intervalId = setInterval(() => {
      if (contentWindow.closed) {
        clearInterval(intervalId);
        reject(new Error("user_cancelled", "User cancelled the flow."));
        return;
      }

      let href;
      try {
        /*
         * Will throw if cross origin,
         * which should be caught and ignored
         * since we need the interval to keep running while on STS UI.
         */
        href = contentWindow.location.href;
      } catch (e) {}

      // Don't process blank pages or cross domain
      if (!href || href === "about:blank") {
        return;
      }

      // Only run clock when we are on same domain
      ticks++;

      if (urlContainsHash(href)) {
        clearInterval(intervalId);
        resolve(contentWindow.location.hash);
      } else if (ticks > maxTicks) {
        clearInterval(intervalId);
        reject(new Error("token_renewal_error", `URL navigated to is ${urlNavigate}, "Token renewal operation failed due to timeout."`)); // better error?
      }
    }, POLLING_INTERVAL_MS);
  });
}

function urlContainsHash(urlString) {
  const parameters = deserializeHash(urlString);
  return (
    parameters.hasOwnProperty("error_description") ||
    parameters.hasOwnProperty("error") ||
    parameters.hasOwnProperty("code")
  );
}

function deserializeHash(urlFragment) {
  const hash = getHashFromUrl(urlFragment);
  return deserialize(hash);
}


function getHashFromUrl(urlStringOrFragment) {
  const hashIndex1 = urlStringOrFragment.indexOf("#");
  const hashIndex2 = urlStringOrFragment.indexOf("#/");
  if (hashIndex2 > -1) {
    return urlStringOrFragment.substring(hashIndex2 + 2);
  } else if (hashIndex1 > -1) {
    return urlStringOrFragment.substring(hashIndex1 + 1);
  }
  return urlStringOrFragment;
}

function deserialize(query) {
  let match; // Regex for replacing addition symbol with a space
  const pl = /\+/g;
  const search = /([^&=]+)=([^&]*)/g;
  const decode = (s) => decodeURIComponent(s.replace(pl, " "));
  const obj = {};
  match = search.exec(query);
  while (match) {
    obj[decode(match[1])] = decode(match[2]);
    match = search.exec(query);
  }
  return obj;
}
