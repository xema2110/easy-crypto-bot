//EasyCryptoBot Copyright (C) 2018 Stefan Hristov
let exchangesApiKeys = {};

function tsExecTypeChange() {
  if ($('#trExecTypeSignals').is(':checked')) {
    $('#tsPosSizeDiv').hide();
    $('#tsMaxLossDiv').hide();
    $('#feeRateDiv').hide();
    $('#emailDiv').show();
  } else if ($('#trExecTypeSim').is(':checked')) {
    $('#emailDiv').hide();
    $('#tsPosSizeDiv').show();
    $('#tsMaxLossDiv').show();
    $('#feeRateDiv').show();
  } else if ($('#trExecTypeTrade').is(':checked')) {
    $('#emailDiv').hide();
    $('#feeRateDiv').hide();
    $('#tsPosSizeDiv').show();
    $('#tsMaxLossDiv').show();
    let exchange = $('#tsExchangeCombobox').text();
    if (exchange !== 'Choose Exchange') {
      checkApiKey(exchange);
    }
  }
}

async function verifyKeyAndSecret(exchange) {
  let key = $('#exchangeApiKey').val();
  let secret = $('#exchangeApiSecret').val();
  if (key.length > 0 && secret.length > 0) {
    let apiKeyOk = await checkBinanceApiKey(key, secret);
    if (!apiKeyOk) {
      openModalInfo('Invalid API Key or Secret!');
      $('#tsExchangeCombobox').html('Choose Exchange');
      return false;
    }
    exchangesApiKeys[exchange] = {
      key: key,
      secret: secret
    };
    return true;
  } else {
    openModalInfo('Invalid API Key or Secret!');
    $('#tsExchangeCombobox').html('Choose Exchange');
    return false;
  }
}

function checkApiKey(exchange) {
  if (exchangesApiKeys[exchange] === undefined) {
    openModalConfirm('<div class="text-justify">Please provide your API key for ' + exchange + '. If you don\'t have a key you can create one under "My Account" page on the ' + exchange + ' website.</div><br><div class="text-left"><span class="inline-block min-width5">API Key:&nbsp;</span><input class="min-width20" id="exchangeApiKey" type="text" placeholder="API KEY" /><br>' + '<span class="inline-block min-width5">Secret:&nbsp;</span><input class="min-width20" id="exchangeApiSecret" type="text" placeholder="Secret" /></div><br><div class="text-justify">Your key and secret are not stored anywhere by this application.</div>', function() {
      verifyKeyAndSecret(exchange);
    }, function() {
      $('#tsExchangeCombobox').html('Choose Exchange');
    });
  }
}
async function tsFillBinanceInstruments() {
  if ($('#trExecTypeTrade').is(':checked')) {
    checkApiKey('Binance');
  }
  await getBinanceInstruments();
}

async function tsInstrumentKeyup() {
  try {
    fillPosSizeDetails();
    fillMaxLossDetails();
    let search = $('#tsInstrumentSearch').val().toLowerCase();
    $('#tsInstrumentList>ul').html('');
    let instruments = null;
    if ($('#tsExchangeCombobox').text() === 'Binance') {
      instruments = await getBinanceInstruments();
    } else {
      $('#tsInstrumentSearch').val('');
      openModalInfo('Please Choose Exchange First!');
      return;
    }

    let lastKey = null;

    if (instruments !== null) {
      let instrumentsToAdd = '';
      Object.keys(instruments).forEach(function(key) {
        if (key.toLowerCase().indexOf(search) != -1) {
          lastKey = key.toLowerCase();
          instrumentsToAdd += '<li><a href="#/"  onclick="tsFillInstrument(\'' + key + '\')">' + key + '</a></li>';
        }
      });
      if (lastKey !== null && lastKey !== search) {
        $('#tsInstrumentList>ul').html(instrumentsToAdd);
        $('#tsInstrument>div>ul').show()
      }

    }
  } catch (err) {}
}

async function tsFillInstrument(name) {
  $('#tsInstrument>div>ul').hide();
  $('#tsInstrumentSearch').val(name);
  fillPosSizeDetails();
  fillMaxLossDetails();
}

async function fillPosSizeDetails() {
  let instrument = $('#tsInstrumentSearch').val().toUpperCase();
  if (instrument.length <= 0 || getQuotedCurrency(instrument) === '' || getBaseCurrency(instrument) === '') {
    $('#tsQuotedCurrency').html('');
    return;
  }
  $('#tsQuotedCurrency').html(getBaseCurrency(instrument));

  let value = $('#tsPosSize').val();
  if (value.length > 0 && Number.parseFloat(value) > 0) {
    let ustdValue = await getBinanceUSDTValue(Number.parseFloat(value), instrument, getQuotedCurrency(instrument));
    if (!isNaN(ustdValue) && $('#tsPosSize').val() == value) {
      $('#tsQuotedCurrency').html(getBaseCurrency(instrument) + ' ($' + ustdValue.toFixed(2) + ')');
    }
  }
}

async function fillMaxLossDetails() {
  let instrument = $('#tsInstrumentSearch').val().toUpperCase();
  if (instrument.length <= 0 || getQuotedCurrency(instrument) === '' || getBaseCurrency(instrument) === '') {
    $('#tsMaxLossCurrency').html('');
    return;
  }
  $('#tsMaxLossCurrency').html(getBaseCurrency(instrument));

  let value = $('#tsMaxLoss').val();
  if (value.length > 0 && Number.parseFloat(value) > 0) {
    let ustdValue = await getBinanceUSDTValue(Number.parseFloat(value), instrument, getQuotedCurrency(instrument));
    if (!isNaN(ustdValue) && $('#tsMaxLoss').val() == value) {
      $('#tsMaxLossCurrency').html(getBaseCurrency(instrument) + ' ($' + ustdValue.toFixed(2) + ')');
    }
  }
}

let executionWorkers = [];
const maxExecutions = 20;
const executionMutex = new Mutex();
function hasTradingStrategies() {
  let has = false;
  for (let worker of executionWorkers) {
    if (worker.status === 'running') {
      has = true;
      break;
    }
  }
  return has;
}
async function executeStrategy() {
  try {
    await executionMutex.lock();
    let runningExecutions = $('#tsStrategiesTable tr').length - 1; //First tr is the header
    if (runningExecutions >= maxExecutions) {
      openModalInfo('The maximum executions number is ' + maxExecutions + '. Please remove an execution before starting new one!');
      return;
    }

    $('#executeStrategyBtn').addClass('disabled');
    let strategyName = $('#tsStrategyCombobox').text();
    let email = $('#emailBox').val();
    let exchange = $('#tsExchangeCombobox').text();
    let instrument = $('#tsInstrumentSearch').val().toUpperCase();
    if (email.indexOf('@') === -1) {
      email = null;
    }
    if (strategyName === 'Choose Strategy') {
      openModalInfo('Please Choose a Strategy!');
      return;
    }
    if (exchange === 'Choose Exchange') {
      openModalInfo('Please Choose an Exchange!');
      return;
    }
    if (exchange === 'Binance') {
      let instruments = await getBinanceInstruments();
      if (!(instrument in instruments)) {
        openModalInfo('Invalid Instrument!<br>Please Choose an Instrument!');
        return;
      }
    }

    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy!');
      $('#tsStrategyCombobox').html('Choose Strategy');
      return;
    }

    let timeframes = getTimeframes(strategy);
    if (timeframes === null) {
      openModalInfo('<h3 class="text-red text-center">ERROR</h3><div class="text-red">Your strategy contains a rule without a timeframe. Please edit your strategy!</div>');
      return;
    }

    let positionSize = '';
    let maxLoss = null;
    let executionType = 'Alerts';
    let feeRate = null;
    if ($('#trExecTypeTrade').is(':checked')) {
      executionType = 'Trading';
    } else if ($('#trExecTypeSim').is(':checked')) {
      executionType = 'Simulation';
      feeRate = Number.parseFloat($('#trFeeBox').val());
      if (feeRate <= 0) {
        openModalInfo('Fee rate should be a positive number!');
        return;
      }
    }

    if ($('#trExecTypeTrade').is(':checked') || $('#trExecTypeSim').is(':checked')) {
      positionSize = Number.parseFloat($('#tsPosSize').val());
      if (isNaN(positionSize) || positionSize <= 0) {
        openModalInfo('Position Size cannot be less than 0 !');
        return;
      }

      let lotSizeInfo = null;
      let instrumentInfo = null;
      if (exchange === 'Binance') {
        instrumentInfo = await getBinanceInstrumentsInfo(instrument);
        //lotSizeInfo = await getBinanceLotSizeInfo(instrument);
      }
      if (instrumentInfo === null || instrumentInfo === undefined) {
        openModalInfo('Cannot obtain information for ' + instrument + ' from ' + exchange + ' exchange. Plase try later!');
        return;
      } else if (positionSize < instrumentInfo.minQty) {
        openModalInfo('Position Size for ' + instrument + ' cannot be less than ' + instrumentInfo.minQty + ' on ' + exchange + ' exchange!');
        return;
      } else if (positionSize > instrumentInfo.maxQty) {
        openModalInfo('Position Size for ' + instrument + ' cannot be greater than ' + instrumentInfo.maxQty + ' on ' + exchange + ' exchange!');
        return;
      }
      let curPrice = null;

      for (let i = 0; i < 10; i++) {
        let bidAsk = await getBinanceBidAsk(instrument);
        if (isNaN(bidAsk[0])) {
          await sleep(100);
        } else {
          curPrice = bidAsk[0];
          break;
        }
      }
      if (curPrice !== null && curPrice * positionSize < instrumentInfo.minNotional) {
        openModalInfo('Position Size for ' + instrument + ' does not meet Binance requirement for minimum trading amount! Try with bigger size than ' + (
        instrumentInfo.minNotional / curPrice).toFixed(8));
        return;
      }

      let newAmount = binanceRoundAmmount(positionSize, instrumentInfo.stepSize);
      if (newAmount.toFixed(8) !== positionSize.toFixed(8)) {
        openModalInfo('The position size will be rounded to ' + newAmount + ' to meet Binance requirements.');
        positionSize = newAmount;
        $('#tsPosSize').val(positionSize)
        return;
      } else {
        positionSize = newAmount;
      }

      let maxLossTmp = Number.parseFloat($('#tsMaxLoss').val());
      if (!isNaN(maxLossTmp) && maxLossTmp !== 0) {
        maxLoss = (-1) * Math.abs(maxLossTmp);
      }
    }

    $('#tsResultDiv').show();

    let dbId = Math.floor((Math.random() * 8999999999) + 1000000000);
    let execTmp = await getExecutionById(dbId);
    while (execTmp !== null) {
      dbId = Math.floor((Math.random() * 8999999999) + 1000000000);
      execTmp = await getExecutionById(dbId);
    }
    let date = new Date();
    let curExecution = {
      id: dbId,
      date: date.getTime(),
      type: executionType,
      name: strategyName,
      strategy: strategy,
      exchange: exchange,
      instrument: instrument,
      positionSize: positionSize,
      status: 'starting',
      maxLoss: maxLoss,
      trades: [],
      trailingSlPriceUsed: null,
      email: email,
      feeRate: feeRate,
      timeframes: timeframes
    }
    addExecutionToDb(curExecution);
    let resStr = '0.00%';
    if (executionType === "Alerts") {
      resStr = '';
    }

    $('#tsStrategiesTable').append('<tr id="executionTableItem' + dbId + '"><td>' + executionType + '</td><td>' + strategyName + '</td><td>' + exchange + '</td><td>' + instrument + '</td><td class="text-center" id="executedTrades' + dbId + '">0</td><td class="text-center" id="openTrade' + dbId + '"></td><td><span id="executionRes' + dbId + '">' + resStr + '</span>&nbsp;' + '<a title="Detailed Results" href="#executionDetailsLabel" onclick="showExecutionResult(\'' + dbId + '\')"><i class="far fa-file-alt"></i></a>&nbsp;</td>' + '<td id="lastUpdatedExecution' + dbId + '"></td><td id="terminateStrBtn' + dbId + '">Starting..</td></tr>');

    await runStrategy(dbId);
    $('html,body').animate({
      scrollTop: document.body.scrollHeight
    }, "fast");
  } catch (err) {
    openModalInfo('Internal Error Occurred!<br>' + err.stack);
  } finally {
    $('#executeStrategyBtn').removeClass('disabled');
    executionMutex.release();
  }
}

function fillExecResInTable(trades, id) {
  let result = 0;
  for (let trade of trades) {
    result += trade.result;
  }
  $('#executionRes' + id).removeClass('text-green');
  $('#executionRes' + id).removeClass('text-red');
  $('#executionRes' + id).html(result.toFixed(2) + '%');
  $('#executionRes' + id).addClass(
    result > 0
    ? 'text-green'
    : result < 0
      ? 'text-red'
      : '');
}

async function checkMaxLossReached(id) {
  let execution = await getExecutionById(id);
  if (execution.maxLoss === null || execution.maxLoss === undefined) {
    return false;
  }

  let result = 0;
  for (let trade of execution.trades) {
    result += trade.result;
  }
  let totalGainLoss = execution.positionSize * (result / 100);
  if (totalGainLoss <= execution.maxLoss) {
    let errorMsg = 'Execution of ' + execution.name + ' on ' + execution.exchange + ' for ' + execution.instrument + ' has reached the maximum loss.<br>The execution was stopped.';
    stopStrategyExecution(id, errorMsg);
    openModalInfo(errorMsg);
    execution.error = errorMsg;
    await updateExecutionDb(execution);
    return true;
  }
  return false;
}

function maxLossInfo() {
  openModalInfoBig('If the total result of all closed trades exeeds the defined Maximum Loss the execution of the strategy will stop automatically.<br>Please take in mind that this is not a single trade stoploss and only fully closed trades are used for the calculation. This means that if an open trade exeeds the Maximum loss the execution will not be stopped until the trade is closed and the total loss may exeeds the defined Max Loss value! You can define a single trade stoploss in your strategy.');
}

async function runStrategy(id) {
  try {
    $('#terminateStrBtn' + id).html('Starting..');
    let execution = await getExecutionById(id);

    let timeframes = getTimeframes(execution.strategy);
    if (timeframes === null) {
      let errorMsg = 'Your strategy contains a rule without a timeframe. Please remove this execution and edit your strategy!';
      execution.error = errorMsg;
      await updateExecutionDb(execution);
      $('#terminateStrBtn' + id).html('Error&nbsp;<a title="Show Error" href="#/" onclick="showErrorMsg(\'' + errorMsg + '\', ' + id + ')"><i class="fas fa-question-circle"></i></a>&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-times"></i></a>');
      openModalInfoBig('<h3 class="text-red text-center">ERROR</h3><div class="text-red">' + errorMsg + '</div>');
      return;
    }

    if (execution.type === 'Trading') {
      if (exchangesApiKeys[execution.exchange] === undefined) {
        openModalConfirm('<div class="text-justify">Please provide your API key for ' + execution.exchange + '. </div><br><div class="text-left"><span class="inline-block min-width5">API Key:&nbsp;</span><input class="min-width20" id="exchangeApiKey" type="text" placeholder="API KEY" /><br>' + '<span class="inline-block min-width5">Secret:&nbsp;</span><input class="min-width20" id="exchangeApiSecret" type="text" placeholder="Secret" /></div><br><div class="text-justify">Your key and secret are not stored anywhere by this application.</div>', async function() {
          let result = await verifyKeyAndSecret(execution.exchange);
          if (result) {
            runStrategy(id);
          } else {
            $('#terminateStrBtn' + id).html('Stopped&nbsp;<a title="Resume Execution" href="#/" onclick="runStrategy(' + id + ')"><i class="fas fa-play"></i></a>&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-times"></i></a>');
          }
        }, function() {
          openModalInfoBig("Cannot run strategy in Real Trading mode without connection to the exchange via your API Key and Secret!");
          $('#terminateStrBtn' + id).html('Stopped&nbsp;<a title="Resume Execution" href="#/" onclick="runStrategy(' + id + ')"><i class="fas fa-play"></i></a>&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-times"></i></a>');
        });
        return;
      }
    }

    let apiKey = 'api-key';
    let apiSecret = 'api-secret';
    if (execution.type === 'Trading') {
      apiKey = exchangesApiKeys[execution.exchange].key;
      apiSecret = exchangesApiKeys[execution.exchange].secret;
    }

    let hasFreeWorker = false;
    for (let worker of executionWorkers) {
      if (worker.status === 'free') {
        worker.status = 'running';
        worker.execId = id;
        hasFreeWorker = true;
        worker.wk.postMessage([execution, apiKey, apiSecret]);
        break;
      }
    }

    if (!hasFreeWorker) {
      let wk = null;
      if (execution.exchange === 'Binance') {
        wk = new Worker("./assets/js/binance-execution.js");
      }
      wk.addEventListener('error', function(e) {
        openModalInfo('Internal Error Occurred!!<br>' + execution.type + ' ' + e.message + '<br>' + e.filename + ' ' + e.lineno);
      }, false);

      const runMutex = new Mutex();
      wk.addEventListener("message", async function(e) {
        try {
          await runMutex.lock();
          let id = e.data[0];
          let execution = await getExecutionById(id);
          let type = e.data[1];
          let data = e.data[2];
          let additionalData = e.data[3];
          switch (type) {
            case 'STARTED':
              $('#terminateStrBtn' + id).html('Running&nbsp;<a class="stop-stgy-exec text-red" title="Stop Execution" href="#/" onclick="stopStrategyExecution(' + id + ')"><i class="fas fa-pause"></i></a>');
              break;
            case 'STOPPED':
              $('#executeStrategyBtn').removeClass('disabled');
              openModalInfoBig('Execution of strategy ' + execution.name + ' on exchang ' + execution.exchange + ' for instrument ' + execution.instrument + ' has failed to start!');
              $('#terminateStrBtn' + id).html('Failed&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-times"></i></a>');
              break;
            case 'ERROR':
              let errorMsg = data.replace("'", "") + '<br><br>The execution of the strategy was stopped!';
              stopStrategyExecution(id, errorMsg);
              execution.error = errorMsg;
              await updateExecutionDb(execution);
              showErrorMsg(errorMsg, id);
              break;
            case 'LAST_UPDATED':
              $('#lastUpdatedExecution' + id).html(formatDateNoYear(new Date()));
              break;
            case 'MSG':
              openModalInfoBig(data);
              break;
            case 'TRAILING_STOP_PRICE':
              execution.takeProfitOrderId = data;
              await updateExecutionDb(execution);
              break;
            case 'CH_POS_SIZE':
              execution.positionSize = data;
              await updateExecutionDb(execution);
              break;
            case 'TAKE_PROFIT_ORDER_ID':
              execution.takeProfitOrderId = data;
              await updateExecutionDb(execution);
              break;
            case 'BUY':
              if (execution.type === 'Alerts') {
                execution.trades.push({type: 'Buy', date: additionalData, entry: data});
                openModalInfo('BUY Alert!<br><div class="text-left">Strategy: ' + execution.name + '<br>Exchange: ' + execution.exchange + '<br>Instrument: ' + execution.instrument + '<br>Date: ' + formatDateFull(additionalData) + '<br>Entry Price: ' + data);
                sendEmail(execution, 'BUY', additionalData, data);
              } else {
                execution.trades.push(data);
              }
              if (execution.type === 'Trading' && execution.feeRate === null || execution.feeRate === undefined) {
                execution.feeRate = additionalData;
              }
              await updateExecutionDb(execution);
              $('#executedTrades' + id).html(execution.trades.length);
              $('#openTrade' + id).html('<i class="fa fa-check"></i>');
              break;
            case 'SELL':
              if (execution.type === 'Alerts') {
                execution.trades.push({type: 'Sell', date: additionalData, entry: data});
                await updateExecutionDb(execution, execution.trades);
                $('#executedTrades' + id).html(execution.trades.length);
                openModalInfo('SELL Alert!<br><div class="text-left">Strategy: ' + execution.name + '<br>Exchange: ' + execution.exchange + '<br>Instrument: ' + execution.instrument + '<br>Date: ' + formatDateFull(additionalData) + '<br>Entry Price: ' + data);
                sendEmail(execution, 'SELL', additionalData, data);
              } else {
                execution.trades[execution.trades.length - 1] = data;
                execution.takeProfitOrderId = null;
                await updateExecutionDb(execution);
                fillExecResInTable(execution.trades, id);
                $('#openTrade' + id).html('');
                await checkMaxLossReached(id);
              }
              break;
            default:
          };
        } catch (err) {
          openModalInfo('Internal Error Occurred!!!<br>' + err.stack);
        } finally {
          runMutex.release();
        }
      }, false);

      executionWorkers.push({status: 'running', execId: id, wk: wk});
      wk.postMessage([execution, apiKey, apiSecret]);
    }
  } catch (err) {
    openModalInfo('Internal Error Occurred!!!!<br>' + err.stack);
  }
}

function showErrorMsg(msg, id) {
  openModalInfoBig('<h3 class="text-red text-center">ERROR</h3><div class="text-red">' + msg + '</div><br><div class="text-center"><a class="button alt white" title="Clear Error" href="#/" onclick="clearError(' + id + ')">Clear Error</a></div>')
}

async function clearError(id) {
  let execution = await getExecutionById(id);
  execution.error = null;
  await updateExecutionDb(execution);
  $('#terminateStrBtn' + id).html('Stopped&nbsp;<a title="Resume Execution" href="#/" onclick="resumeExecution(' + id + ')"><i class="fas fa-play"></i></a>');
  openModalInfo('<h3>Error cleared!</h3>You can resume the execution of your strategy by clicking the play button.');
}

async function rmExecutionFromTable(id) {
  let execution = await getExecutionById(id);
  openModalConfirm("Remove " + execution.name + " execution?", async function() {
    for (let worker of executionWorkers) {
      if (worker.execId == id) {
        worker.wk.postMessage('TERMINATE');
        worker.status = 'free';
        break;
      }
    }
    $('#executionTableItem' + id).remove();
    await sleep(100);
    await removeExecutionFromDb(id);
  });
}

async function resumeExecution(id) {
  let hasWorker = false;
  for (let worker of executionWorkers) {
    if (worker.execId == id) {
      worker.status = 'running';
      $('#terminateStrBtn' + id).html('Starting..');
      worker.wk.postMessage('RESUME');
      hasWorker = true;
      break;
    }
  }
  if (!hasWorker) {
    runStrategy(id);
  }
}

function stopStrategyExecution(id, errorMsg) {

  for (let worker of executionWorkers) {
    if (worker.execId == id) {
      worker.status = 'paused';
      worker.wk.postMessage('PAUSE');
      break;
    }
  }
  if (errorMsg !== null && errorMsg !== undefined) {
    $('#terminateStrBtn' + id).html('Error&nbsp;<a title="Show Error" href="#/" onclick="showErrorMsg(\'' + errorMsg + '\',' + id + ')"><i class="fas fa-question-circle"></i></a>&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-times"></i></a>');
  } else {
    $('#terminateStrBtn' + id).html('Stopped&nbsp;<a title="Resume Execution" href="#/" onclick="resumeExecution(' + id + ')"><i class="fas fa-play"></i></a>&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + id + ')"><i class="fas fa-times"></i></a>');
  }
}

async function showExecutionResult(id) {
  let execution = await getExecutionById(id);
  $('#executionStrategiesTable').html('<thead><tr><td class="text-left">Trade</td><td>Open Date</td><td>Close Date</td><td>Open Price</td><td>Close Price</td><td>Result</td></tr></thead>');

  if (execution.type === 'Alerts') {
    $('#executionDetailsLabel').html('Alerts');
    $('.trade-section').hide();
    $('#executionDetailsLabel2').hide();
    $('#executionTableLabel').hide();
    $('#executionPosSizeResDiv').hide();
    $('#executionMaxLossResDiv').hide();
    $('#executionStrategiesTable').html('<thead><tr><td class="text-left">Direction</td><td>Date</td><td>Entry Price</td></tr></thead>');
    for (let trade of execution.trades) {
      let classColor = trade.type === 'Buy'
        ? 'text-green'
        : 'text-red';
      $('#executionStrategiesTable').append('<tr><td class="text-left ' + classColor + '">' + trade.type + '</td><td>' + formatDateFull(trade.date) + '</td><td>' + trade.entry.toFixed(8) + '</td></tr>');
    }
  } else {
    let totalReturn = 0;
    let winLossRatio = 0;
    let avgGainLossPerTrade = 0;
    let resultWithUSD = 0;
    let executedTrades = execution.trades.length;

    let winningPercent = 0;
    let winnignCount = 0;
    let avgWinPerTrade = 0;
    let biggestGain = 0;

    let loosingPercent = 0;
    let loosingCount = 0;
    let avgLostPerTrade = 0;
    let biggestLost = 0;

    let count = 1;
    if (execution.feeRate !== null && execution.feeRate !== undefined) {
      $('#executionFeeRate').html('Fee Rate per trade: ' + execution.feeRate.toFixed(4) + '%');
    } else {
      $('#executionFeeRate').html('');
    }
    for (let trade of execution.trades) {
      if (trade.closeDate !== undefined) {
        let classes = '';
        let resultClass = '';
        if (trade.result > 0) {
          if (biggestGain < trade.result) {
            biggestGain = trade.result;
          }
          winnignCount++;
          avgWinPerTrade += trade.result;
          classes = 'text-green fas fa-thumbs-up';
          resultClass = 'text-green';
        } else if (trade.result < 0) {
          if (biggestLost > trade.result) {
            biggestLost = trade.result;
          }
          loosingCount++;
          avgLostPerTrade += trade.result;
          classes = 'text-red fas fa-thumbs-down';
          resultClass = 'text-red';
        }
        totalReturn += trade.result;
        $('#executionStrategiesTable').append('<tr><td class="text-left">' + count + '&nbsp;<i class="' + classes + '"></td><td>' + formatDateFull(trade.openDate) + '</td><td>' + formatDateFull(trade.closeDate) + '</td><td>' + trade.entry.toFixed(8) + '</td><td>' + trade.exit.toFixed(8) + '</td><td class="' + resultClass + '">' + trade.result.toFixed(2) + '%</td></tr>');
      } else {
        $('#executionStrategiesTable').append('<tr><td class="text-left">' + count + '</td><td>' + formatDateFull(trade.openDate) + '</td><td></td><td>' + trade.entry.toFixed(8) + '</td><td></td><td ></td></tr>');
        executedTrades--;
      }
      count++;
    }
    if (executedTrades > 0) {
      avgGainLossPerTrade = totalReturn / executedTrades;
      winningPercent = (winnignCount / executedTrades) * 100;
      loosingPercent = (loosingCount / executedTrades) * 100;
      resultWithUSD = execution.positionSize * (totalReturn / 100);
    }
    if (loosingCount > 0) {
      winLossRatio = winnignCount / loosingCount;
    } else if (winnignCount > 0) {
      winLossRatio = 1;
    }
    if (winnignCount > 0) {
      avgWinPerTrade = avgWinPerTrade / winnignCount;
    }
    if (loosingCount > 0) {
      avgLostPerTrade = avgLostPerTrade / loosingCount;
    }

    $('#executionTotalReturn').html(totalReturn.toFixed(2) + '%');
    $('#executionWinLoss').html(winLossRatio.toFixed(2));
    $('#executionAvgWinLossPerTrade').html(avgGainLossPerTrade.toFixed(2) + '%');

    $('#executionResultWithUsd').html(resultWithUSD.toFixed(8) + '&nbsp;' + getBaseCurrency(execution.instrument));
    $('#executionExecutedTrades').html(executedTrades);

    $('#executionWinningTradesP').html(winningPercent.toFixed(2) + '%');
    $('#executionWinningCount').html(winnignCount);
    $('#executionAvgGainPerWinning').html(avgWinPerTrade.toFixed(2) + '%');
    $('#executionBiggestGain').html(biggestGain.toFixed(2) + '%');

    $('#executionLoosingTradesP').html(loosingPercent.toFixed(2) + '%');
    $('#executionLoosingCount').html(loosingCount);
    $('#executionAvgLostPerWinning').html(avgLostPerTrade.toFixed(2) + '%');
    $('#executionBiggestLost').html(biggestLost.toFixed(2) + '%');

    $('#executionPosSizeResDiv').show();
    $('#executionPosSizeRes').html(execution.positionSize + ' ' + getBaseCurrency(execution.instrument));
    if (execution.maxLoss !== null) {
      $('#executionMaxLossResDiv').show();
      $('#executionMasLossRes').html(Math.abs(execution.maxLoss) + ' ' + getBaseCurrency(execution.instrument));
    } else {
      $('#executionMaxLossResDiv').hide();
    }
    fillUSDFields(resultWithUSD, execution.positionSize, execution.maxLoss, execution.instrument);

    $('#executionDetailsLabel').html(
      execution.type === 'Simulation'
      ? 'Execution Details (Simulation)'
      : 'Execution Details');
    $('#executionDetailsLabel2').show();
    $('.trade-section').show();
    $('#executionTableLabel').show();
  }
  $('#executionStrategyRes').html(execution.name);
  $('#executionExchangeRes').html(execution.exchange);
  $('#executionInstrumentRes').html(execution.instrument);
  $('#tradeBody').css('opacity', '0.5');
  $('#tradeBody').css('pointer-events', 'none');
  $('#sidebar').css('opacity', '0.5');
  $('#sidebar').css('pointer-events', 'none');
  $('body').css('overflow', 'hidden');
  $('#executionResultsWindow').fadeIn();
}

async function fillUSDFields(resultWithUSD, posSize, maxLoss, instrument) {
  let ustdValue = await getBinanceUSDTValue(resultWithUSD, instrument, getQuotedCurrency(instrument));
  $('#executionResultWithUsd').html(resultWithUSD.toFixed(8) + '&nbsp;' + getBaseCurrency(instrument) + ' ( ~' + ustdValue.toFixed(2) + '$ )');

  let posSizeUsd = await getBinanceUSDTValue(posSize, instrument, getQuotedCurrency(instrument));
  $('#executionPosSizeRes').html(execution.positionSize + '&nbsp;' + getBaseCurrency(execution.instrument) + ' ( ~' + posSizeUsd.toFixed(2) + '$ )');
  if (maxLoss !== null) {
    let maxLossUsd = await getBinanceUSDTValue(resultWithUSD, instrument, getQuotedCurrency(instrument));
    $('#executionMasLossRes').html(Math.abs(execution.maxLoss) + '&nbsp;' + getBaseCurrency(execution.instrument) + ' ( ~' + maxLossUsd.toFixed(2) + '$ )');
  }
}

function closeExecutionWindow() {
  $('#tradeBody').css('opacity', '1');
  $('#tradeBody').css('pointer-events', 'auto');
  $('#sidebar').css('opacity', '1');
  $('#sidebar').css('pointer-events', 'auto');
  $('body').css('overflow', 'auto');
  $('#executionResultsWindow').hide();
}

var executionsDb = null;
function getExecutionsDb() {
  if (executionsDb === null) {
    executionsDb = new Datastore({
      filename: getAppDataFolder() + '/db/executions.db',
      autoload: true
    });
    executionsDb.persistence.setAutocompactionInterval(1000 * 60 * 5); //Every 5 minutes
  }
  return executionsDb;
}

let executionFilled = false;
async function fillOldExecutions() {
  if (!executionFilled) {
    executionFilled = true;
    let executions = await getExecutionsFromDb();
    if (executions !== null && executions.length > 0) {
      for (let execution of executions) {

        //Check for old version strategies without individual rule timeframes
        let hasRuleWithNoTf = false;
        for (let rule of execution.strategy.buyRules) {
          if (rule.timeframe === null || rule.timeframe === undefined) {
            hasRuleWithNoTf = true;
            break;
          }
        }
        for (let rule of execution.strategy.sellRules) {
          if (rule.timeframe === null || rule.timeframe === undefined) {
            hasRuleWithNoTf = true;
            break;
          }
        }
        if (hasRuleWithNoTf) {
          execution.error = 'This strategy contains rules without individual timeframes. You will not be able to resume the execution. You can remove this execution, edit the strategy by adding timeframes to each rule and then execute it again.';
          updateExecutionDb(executions);
        }

        let status = 'Stopped&nbsp;<a title="Resume Execution" href="#/" onclick="runStrategy(' + execution.id + ')"><i class="fas fa-play"></i></a>';
        if (execution.error !== null && execution.error !== undefined) {
          status = 'Error&nbsp;<a title="Show Error" href="#/" onclick="showErrorMsg(\'' + execution.error + '\',' + execution.id + ')"><i class="fas fa-question-circle"></i></a>'
        }
        let openTrade = '';
        if (execution.trades.length > 0 && execution.trades[execution.trades.length - 1].exit === undefined) {
          openTrade = '<i class="fa fa-check"></i>';
        }
        $('#tsStrategiesTable').append('<tr id="executionTableItem' + execution.id + '"><td>' + execution.type + '</td><td>' + execution.name + '</td><td>' + execution.exchange + '</td><td>' + execution.instrument + '</td><td class="text-center" id="executedTrades' + execution.id + '">' + execution.trades.length + '</td><td class="text-center" id="openTrade' + execution.id + '">' + openTrade + '</td><td><span id="executionRes' + execution.id + '"></span>&nbsp;' + '<a title="Detailed Results" href="#executionDetailsLabel" onclick="showExecutionResult(' + execution.id + ')"><i class="far fa-file-alt"></i></a>&nbsp;</td>' + '<td id="lastUpdatedExecution' + execution.id + '"></td><td id="terminateStrBtn' + execution.id + '">' + status + '&nbsp;<a title="Remove Execution" href="#/" onclick="rmExecutionFromTable(' + execution.id + ')"><i class="fas fa-times"></i></a></td></tr>');
        if (execution.type !== 'Alerts') {
          fillExecResInTable(execution.trades, execution.id);
        }
      }
      $('#tsResultDiv').show();
    }
  }
}

function getExecutionsFromDb() {
  return new Promise((resolve, reject) => {
    getExecutionsDb().find({}).sort({date: 1}).exec((error, executions) => {
      if (error) {
        reject(error);
      } else {
        resolve(executions);
      }
    })
  });
}

function getExecutionById(id) {
  if (typeof id === 'string') {
    id = Number(id);
  }
  return new Promise((resolve, reject) => {
    getExecutionsDb().findOne({
      id: id
    }, (error, result) => {
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    })
  });
}

function addExecutionToDb(execution) {
  return new Promise((resolve, reject) => {
    getExecutionsDb().insert(execution, (error, srt) => {
      if (error) {
        reject(error);
      } else {
        resolve(srt);
      }
    })
  });
}

const executionDbUpdateMutex = new Mutex();

async function updateExecutionDb(execution) {
  try {
    await executionDbUpdateMutex.lock();
    await removeExecutionFromDb(execution.id);
    await addExecutionToDb(execution);
    //getExecutionsDb().persistence.compactDatafile();
  } finally {
    executionDbUpdateMutex.release();
  }
}

function removeExecutionFromDb(id) {
  return new Promise((resolve, reject) => {
    getExecutionsDb().remove({
      id: id
    }, function(error, numDeleted) {
      if (error) {
        reject(error);
      } else {
        resolve(numDeleted);
      }
    })
  });
}

function sendEmail(execution, type, date, entry) {
  if (execution.email === null || execution.email === undefined) {
    return;
  }
  $.post("https://easycryptobot.com/mail-sender.php", {
    f: 'ecb',
    m: execution.email,
    s: execution.strategy.name,
    i: execution.instrument,
    d: formatDateFull(date),
    e: entry,
    t: type
  }, function(data, status) {});
}

async function editTrStrategy() {
  try {
    let strategyName = $('#tsStrategyCombobox').text();
    let strategy = await getStrategyByName(strategyName);
    if (strategy === null) {
      openModalInfo('Please Choose a Strategy to Edit!');
      $('#tsStrategyCombobox').html('Choose Strategy');
      return;
    }
    editStrategy(strategyName);
  } catch (err) {}
}
