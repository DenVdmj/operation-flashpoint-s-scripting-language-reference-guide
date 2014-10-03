
var hljs = new function() {

  /* Utility functions */

  function escape(value) {
    return value.replace(/&/gm, '&amp;').replace(/</gm, '&lt;').replace(/>/gm, '&gt;');
  }

  function tag(node) {
    return node.nodeName.toLowerCase();
  }

  function testRe(re, lexeme) {
    var match = re && re.exec(lexeme);
    return match && match.index == 0;
  }

  function blockLanguage(block) {
    var classes = (block.className + ' ' + (block.parentNode ? block.parentNode.className : '')).split(/\s+/);
    classes = classes.map(function(c) {return c.replace(/^lang(uage)?-/, '');});
    return classes.filter(function(c) {return getLanguage(c) || c == 'no-highlight';})[0];
  }

  function inherit(parent, obj) {
    var result = {};
    for (var key in parent)
      result[key] = parent[key];
    if (obj)
      for (var key in obj)
        result[key] = obj[key];
    return result;
  };

  /* Stream merging */

  function nodeStream(node) {
    var result = [];
    (function _nodeStream(node, offset) {
      for (var child = node.firstChild; child; child = child.nextSibling) {
        if (child.nodeType == 3)
          offset += child.nodeValue.length;
        else if (tag(child) == 'br')
          offset += 1;
        else if (child.nodeType == 1) {
          result.push({
            event: 'start',
            offset: offset,
            node: child
          });
          offset = _nodeStream(child, offset);
          result.push({
            event: 'stop',
            offset: offset,
            node: child
          });
        }
      }
      return offset;
    })(node, 0);
    return result;
  }

  function mergeStreams(original, highlighted, value) {
    var processed = 0;
    var result = '';
    var nodeStack = [];

    function selectStream() {
      if (!original.length || !highlighted.length) {
        return original.length ? original : highlighted;
      }
      if (original[0].offset != highlighted[0].offset) {
        return (original[0].offset < highlighted[0].offset) ? original : highlighted;
      }

      /*
      To avoid starting the stream just before it should stop the order is
      ensured that original always starts first and closes last:

      if (event1 == 'start' && event2 == 'start')
        return original;
      if (event1 == 'start' && event2 == 'stop')
        return highlighted;
      if (event1 == 'stop' && event2 == 'start')
        return original;
      if (event1 == 'stop' && event2 == 'stop')
        return highlighted;

      ... which is collapsed to:
      */
      return highlighted[0].event == 'start' ? original : highlighted;
    }

    function open(node) {
      function attr_str(a) {return ' ' + a.nodeName + '="' + escape(a.value) + '"';}
      result += '<' + tag(node) + Array.prototype.map.call(node.attributes, attr_str).join('') + '>';
    }

    function close(node) {
      result += '</' + tag(node) + '>';
    }

    function render(event) {
      (event.event == 'start' ? open : close)(event.node);
    }

    while (original.length || highlighted.length) {
      var stream = selectStream();
      result += escape(value.substr(processed, stream[0].offset - processed));
      processed = stream[0].offset;
      if (stream == original) {
        /*
        On any opening or closing tag of the original markup we first close
        the entire highlighted node stack, then render the original tag along
        with all the following original tags at the same offset and then
        reopen all the tags on the highlighted stack.
        */
        nodeStack.reverse().forEach(close);
        do {
          render(stream.splice(0, 1)[0]);
          stream = selectStream();
        } while (stream == original && stream.length && stream[0].offset == processed);
        nodeStack.reverse().forEach(open);
      } else {
        if (stream[0].event == 'start') {
          nodeStack.push(stream[0].node);
        } else {
          nodeStack.pop();
        }
        render(stream.splice(0, 1)[0]);
      }
    }
    return result + escape(value.substr(processed));
  }

  /* Initialization */

  function compileLanguage(language) {

    function reStr(re) {
        return (re && re.source) || re;
    }

    function langRe(value, global) {
      return RegExp(
        reStr(value),
        'm' + (language.cI ? 'i' : '') + (global ? 'g' : '')
      );
    }

    function compileMode(mode, parent) {
      if (mode.compiled)
        return;
      mode.compiled = true;

      mode.k = mode.k || mode.bK;
      if (mode.k) {
        var compiled_keywords = {};

        function flatten(cN, str) {
          if (language.cI) {
            str = str.toLowerCase();
          }
          str.split(' ').forEach(function(kw) {
            var pair = kw.split('|');
            compiled_keywords[pair[0]] = [cN, pair[1] ? Number(pair[1]) : 1];
          });
        }

        if (typeof mode.k == 'string') { // string
          flatten('keyword', mode.k);
        } else {
          Object.keys(mode.k).forEach(function (cN) {
            flatten(cN, mode.k[cN]);
          });
        }
        mode.k = compiled_keywords;
      }
      mode.lR = langRe(mode.l || /\b[A-Za-z0-9_]+\b/, true);

      if (parent) {
        if (mode.bK) {
          mode.b = '\\b(' + mode.bK.split(' ').join('|') + ')\\b';
        }
        if (!mode.b)
          mode.b = /\B|\b/;
        mode.bR = langRe(mode.b);
        if (!mode.e && !mode.eW)
          mode.e = /\B|\b/;
        if (mode.e)
          mode.eR = langRe(mode.e);
        mode.tE = reStr(mode.e) || '';
        if (mode.eW && parent.tE)
          mode.tE += (mode.e ? '|' : '') + parent.tE;
      }
      if (mode.i)
        mode.iR = langRe(mode.i);
      if (mode.r === undefined)
        mode.r = 1;
      if (!mode.c) {
        mode.c = [];
      }
      var expanded_contains = [];
      mode.c.forEach(function(c) {
        if (c.v) {
          c.v.forEach(function(v) {expanded_contains.push(inherit(c, v));});
        } else {
          expanded_contains.push(c == 'self' ? mode : c);
        }
      });
      mode.c = expanded_contains;
      mode.c.forEach(function(c) {compileMode(c, mode);});

      if (mode.starts) {
        compileMode(mode.starts, parent);
      }

      var t =
        mode.c.map(function(c) {
          return c.bK ? '\\.?(' + c.b + ')\\.?' : c.b;
        })
        .concat([mode.tE, mode.i])
        .map(reStr)
        .filter(Boolean);
      mode.t = t.length ? langRe(t.join('|'), true) : {exec: function(s) {return null;}};

      mode.continuation = {};
    }

    compileMode(language);
  }

  /*
  Core highlighting function. Accepts a language name, or an alias, and a
  string with the code to highlight. Returns an object with the following
  properties:

  - relevance (int)
  - value (an HTML string with highlighting markup)

  */
  function highlight(name, value, ignore_illegals, continuation) {

    function subMode(lexeme, mode) {
      for (var i = 0; i < mode.c.length; i++) {
        if (testRe(mode.c[i].bR, lexeme)) {
          return mode.c[i];
        }
      }
    }

    function endOfMode(mode, lexeme) {
      if (testRe(mode.eR, lexeme)) {
        return mode;
      }
      if (mode.eW) {
        return endOfMode(mode.parent, lexeme);
      }
    }

    function isIllegal(lexeme, mode) {
      return !ignore_illegals && testRe(mode.iR, lexeme);
    }

    function keywordMatch(mode, match) {
      var match_str = language.cI ? match[0].toLowerCase() : match[0];
      return mode.k.hasOwnProperty(match_str) && mode.k[match_str];
    }

    function buildSpan(classname, insideSpan, leaveOpen, noPrefix) {
      var classPrefix = noPrefix ? '' : options.classPrefix,
          openSpan    = '<span class="' + classPrefix,
          closeSpan   = leaveOpen ? '' : '</span>';

      openSpan += classname + '">';

      return openSpan + insideSpan + closeSpan;
    }

    function processKeywords() {
      if (!top.k)
        return escape(mode_buffer);
      var result = '';
      var last_index = 0;
      top.lR.lastIndex = 0;
      var match = top.lR.exec(mode_buffer);
      while (match) {
        result += escape(mode_buffer.substr(last_index, match.index - last_index));
        var keyword_match = keywordMatch(top, match);
        if (keyword_match) {
          r += keyword_match[1];
          result += buildSpan(keyword_match[0], escape(match[0]));
        } else {
          result += escape(match[0]);
        }
        last_index = top.lR.lastIndex;
        match = top.lR.exec(mode_buffer);
      }
      return result + escape(mode_buffer.substr(last_index));
    }

    function processSubLanguage() {
      if (top.sL && !languages[top.sL]) {
        return escape(mode_buffer);
      }
      var result = top.sL ? highlight(top.sL, mode_buffer, true, top.continuation.top) : highlightAuto(mode_buffer);
      // Counting embedded language score towards the host language may be disabled
      // with zeroing the containing mode r. Usecase in point is Markdown that
      // allows XML everywhere and makes every XML snippet to have a much larger Markdown
      // score.
      if (top.r > 0) {
        r += result.r;
      }
      if (top.subLanguageMode == 'continuous') {
        top.continuation.top = result.top;
      }
      return buildSpan(result.language, result.value, false, true);
    }

    function processBuffer() {
      return top.sL !== undefined ? processSubLanguage() : processKeywords();
    }

    function startNewMode(mode, lexeme) {
      var markup = mode.cN? buildSpan(mode.cN, '', true): '';
      if (mode.rB) {
        result += markup;
        mode_buffer = '';
      } else if (mode.eB) {
        result += escape(lexeme) + markup;
        mode_buffer = '';
      } else {
        result += markup;
        mode_buffer = lexeme;
      }
      top = Object.create(mode, {parent: {value: top}});
    }

    function processLexeme(buffer, lexeme) {

      mode_buffer += buffer;
      if (lexeme === undefined) {
        result += processBuffer();
        return 0;
      }

      var new_mode = subMode(lexeme, top);
      if (new_mode) {
        result += processBuffer();
        startNewMode(new_mode, lexeme);
        return new_mode.rB ? 0 : lexeme.length;
      }

      var end_mode = endOfMode(top, lexeme);
      if (end_mode) {
        var origin = top;
        if (!(origin.rE || origin.eE)) {
          mode_buffer += lexeme;
        }
        result += processBuffer();
        do {
          if (top.cN) {
            result += '</span>';
          }
          r += top.r;
          top = top.parent;
        } while (top != end_mode.parent);
        if (origin.eE) {
          result += escape(lexeme);
        }
        mode_buffer = '';
        if (end_mode.starts) {
          startNewMode(end_mode.starts, '');
        }
        return origin.rE ? 0 : lexeme.length;
      }

      if (isIllegal(lexeme, top))
        throw new Error('Illegal lexeme "' + lexeme + '" for mode "' + (top.cN || '<unnamed>') + '"');

      /*
      Parser should not reach this point as all types of lexemes should be caught
      earlier, but if it does due to some bug make sure it advances at least one
      character forward to prevent infinite looping.
      */
      mode_buffer += lexeme;
      return lexeme.length || 1;
    }

    var language = getLanguage(name);
    if (!language) {
      throw new Error('Unknown language: "' + name + '"');
    }

    compileLanguage(language);
    var top = continuation || language;
    var result = '';
    for(var current = top; current != language; current = current.parent) {
      if (current.cN) {
        result += buildSpan(current.cN, result, true);
      }
    }
    var mode_buffer = '';
    var r = 0;
    try {
      var match, count, index = 0;
      while (true) {
        top.t.lastIndex = index;
        match = top.t.exec(value);
        if (!match)
          break;
        count = processLexeme(value.substr(index, match.index - index), match[0]);
        index = match.index + count;
      }
      processLexeme(value.substr(index));
      for(var current = top; current.parent; current = current.parent) { // close dangling modes
        if (current.cN) {
          result += '</span>';
        }
      };
      return {
        r: r,
        value: result,
        language: name,
        top: top
      };
    } catch (e) {
      if (e.message.indexOf('Illegal') != -1) {
        return {
          r: 0,
          value: escape(value)
        };
      } else {
        throw e;
      }
    }
  }

  /*
  Highlighting with language detection. Accepts a string with the code to
  highlight. Returns an object with the following properties:

  - language (detected language)
  - relevance (int)
  - value (an HTML string with highlighting markup)
  - second_best (object with the same structure for second-best heuristically
    detected language, may be absent)

  */
  function highlightAuto(text, languageSubset) {
    languageSubset = languageSubset || options.languages || Object.keys(languages);
    var result = {
      r: 0,
      value: escape(text)
    };
    var second_best = result;
    languageSubset.forEach(function(name) {
      if (!getLanguage(name)) {
        return;
      }
      var current = highlight(name, text, false);
      current.language = name;
      if (current.r > second_best.r) {
        second_best = current;
      }
      if (current.r > result.r) {
        second_best = result;
        result = current;
      }
    });
    if (second_best.language) {
      result.second_best = second_best;
    }
    return result;
  }

  /*
  Post-processing of the highlighted markup:

  - replace TABs with something more useful
  - replace real line-breaks with '<br>' for non-pre containers

  */
  function fixMarkup(value) {
    if (options.tabReplace) {
      value = value.replace(/^((<[^>]+>|\t)+)/gm, function(match, p1, offset, s) {
        return p1.replace(/\t/g, options.tabReplace);
      });
    }
    if (options.useBR) {
      value = value.replace(/\n/g, '<br>');
    }
    return value;
  }

  /*
  Applies highlighting to a DOM node containing code. Accepts a DOM node and
  two optional parameters for fixMarkup.
  */
  function highlightBlock(block) {
    var text = options.useBR ? block.innerHTML
      .replace(/\n/g,'').replace(/<br>|<br [^>]*>/g, '\n').replace(/<[^>]*>/g,'')
      : block.textContent;
    var language = blockLanguage(block);
    if (language == 'no-highlight')
        return;
    var result = language ? highlight(language, text, true) : highlightAuto(text);
    var original = nodeStream(block);
    if (original.length) {
      var pre = document.createElementNS('http://www.w3.org/1999/xhtml', 'pre');
      pre.innerHTML = result.value;
      result.value = mergeStreams(original, nodeStream(pre), text);
    }
    result.value = fixMarkup(result.value);

    block.innerHTML = result.value;
    block.className += ' hljs ' + (!language && result.language || '');
    block.result = {
      language: result.language,
      re: result.r
    };
    if (result.second_best) {
      block.second_best = {
        language: result.second_best.language,
        re: result.second_best.r
      };
    }
  }

  var options = {
    classPrefix: 'hljs-',
    tabReplace: null,
    useBR: false,
    languages: undefined
  };

  /*
  Updates highlight.js global options with values passed in the form of an object
  */
  function configure(user_options) {
    options = inherit(options, user_options);
  }

  /*
  Applies highlighting to all <pre><code>..</code></pre> blocks on a page.
  */
  function initHighlighting() {
    if (initHighlighting.called)
      return;
    initHighlighting.called = true;

    var blocks = document.querySelectorAll('pre code');
    Array.prototype.forEach.call(blocks, highlightBlock);
  }

  /*
  Attaches highlighting to the page load event.
  */
  function initHighlightingOnLoad() {
    addEventListener('DOMContentLoaded', initHighlighting, false);
    addEventListener('load', initHighlighting, false);
  }

  var languages = {};
  var aliases = {};

  function registerLanguage(name, language) {
    var lang = languages[name] = language(this);
    if (lang.aliases) {
      lang.aliases.forEach(function(alias) {aliases[alias] = name;});
    }
  }

  function listLanguages() {
    return Object.keys(languages);
  }

  function getLanguage(name) {
    return languages[name] || languages[aliases[name]];
  }

  /* Interface definition */

  this.highlight = highlight;
  this.highlightAuto = highlightAuto;
  this.fixMarkup = fixMarkup;
  this.highlightBlock = highlightBlock;
  this.configure = configure;
  this.initHighlighting = initHighlighting;
  this.initHighlightingOnLoad = initHighlightingOnLoad;
  this.registerLanguage = registerLanguage;
  this.listLanguages = listLanguages;
  this.getLanguage = getLanguage;
  this.inherit = inherit;

  // Common regexps
  this.IR = '[a-zA-Z][a-zA-Z0-9_]*';
  this.UIR = '[a-zA-Z_][a-zA-Z0-9_]*';
  this.NR = '\\b\\d+(\\.\\d+)?';
  this.CNR = '(\\b0[xX][a-fA-F0-9]+|(\\b\\d+(\\.\\d*)?|\\.\\d+)([eE][-+]?\\d+)?)'; // 0x..., 0..., decimal, float
  this.BNR = '\\b(0b[01]+)'; // 0b...
  this.RSR = '!|!=|!==|%|%=|&|&&|&=|\\*|\\*=|\\+|\\+=|,|-|-=|/=|/|:|;|<<|<<=|<=|<|===|==|=|>>>=|>>=|>=|>>>|>>|>|\\?|\\[|\\{|\\(|\\^|\\^=|\\||\\|=|\\|\\||~';

  // Common modes
  this.BE = {
    b: '\\\\[\\s\\S]', r: 0
  };
  this.ASM = {
    cN: 'string',
    b: '\'', e: '\'',
    i: '\\n',
    c: [this.BE]
  };
  this.QSM = {
    cN: 'string',
    b: '"', e: '"',
    i: '\\n',
    c: [this.BE]
  };
  this.PWM = {
    b: /\b(a|an|the|are|I|I'm|isn't|don't|doesn't|won't|but|just|should|pretty|simply|enough|gonna|going|wtf|so|such)\b/
  };
  this.CLCM = {
    cN: 'comment',
    b: '//', e: '$',
    c: [this.PWM]
  };
  this.CBCM = {
    cN: 'comment',
    b: '/\\*', e: '\\*/',
    c: [this.PWM]
  };
  this.HCM = {
    cN: 'comment',
    b: '#', e: '$',
    c: [this.PWM]
  };
  this.NM = {
    cN: 'number',
    b: this.NR,
    r: 0
  };
  this.CNM = {
    cN: 'number',
    b: this.CNR,
    r: 0
  };
  this.BNM = {
    cN: 'number',
    b: this.BNR,
    r: 0
  };
  this.CSSNM = {
    cN: 'number',
    b: this.NR + '(' +
      '%|em|ex|ch|rem'  +
      '|vw|vh|vmin|vmax' +
      '|cm|mm|in|pt|pc|px' +
      '|deg|grad|rad|turn' +
      '|s|ms' +
      '|Hz|kHz' +
      '|dpi|dpcm|dppx' +
      ')?',
    r: 0
  };
  this.RM = {
    cN: 'regexp',
    b: /\//, e: /\/[gim]*/,
    i: /\n/,
    c: [
      this.BE,
      {
        b: /\[/, e: /\]/,
        r: 0,
        c: [this.BE]
      }
    ]
  };
  this.TM = {
    cN: 'title',
    b: this.IR,
    r: 0
  };
  this.UTM = {
    cN: 'title',
    b: this.UIR,
    r: 0
  };
}();

hljs.registerLanguage('arma-cpp', function(hljs) {
  var CPP_KEYWORDS = {
    keyword: 'class|1000 false true',
    reserved: 'onloadmission onloadintro onloadmissiontime onloadintrotime loadscreen cfgloadingtexts minscore avgscore maxscore respawn respawndelay respawnvehicledelay respawndialog cfgsounds cfgradio cfgmusic cfgidentities keys keyslimit donekeys disableai aikills briefing debriefing showgps showcompass showmap shownotepad showpad showwatch scriptedplayer rsctitles weapons magazines backpacks weaponpool params header disablechannels enableitemsdropping'
  };
  return {
    cI: true,
    k: CPP_KEYWORDS,
    c: [
      hljs.CLCM,
      hljs.CBCM,
      {
        cN: 'string',
        b: '"((?:[^"])|(?:""))*"',
        r: 0
      },
      {
        cN: 'number',
        b: '\\b(\\d+(\\.\\d*)?|\\.\\d+)(u|U|l|L|ul|UL|f|F)'
      },
      hljs.CNM,
      {
        cN: 'preprocessor',
        b: '#(?:(?:include)|(?:define)|(?:undef)|(?:ifdef)|(?:ifndef)|(?:else)|(?:endif))'
      },
      {
        cN: 'preprocessor',
        b: '\\b__(?:(?:LINE)|(?:FILE)|(?:EXEC)|(?:EVAL))__\\b'
      },
      {
        cN: 'reserved',
        b: '\\b(title|values|defValue|texts)Param\\d+\\b'
      }
    ]
  };
});

hljs.registerLanguage('sqf', function(hljs) {

  var sqf_keyword = 'AISFinishHeal ASLToATL ATLToASL WFSideText abs accTime acos action actionKeys actionKeysImages actionKeysNames actionKeysNamesArray activateAddons activateKey addAction addBackpack addBackpackCargo addBackpackCargoGlobal addCamShake addEditorObject addEventHandler addGroupIcon addLiveStats addMPEventHandler addMagazine addMagazineCargo addMagazineCargoGlobal addMagazinePool addMagazineTurret addMenu addMenuItem addPublicVariableEventHandler addRating addResources addScore addSwitchableUnit addTeamMember addVehicle addWaypoint addWeapon addWeaponCargo addWeaponCargoGlobal addWeaponPool agent agents aimPos aimedAtTarget airportSide alive allDead allGroups allMissionObjects allUnits allow3DMode allowCrewInImmobile allowDamage allowDammage allowFileOperations allowFleeing allowGetIn ammo animate animationPhase animationState armoryPoints asin assert assignAsCargo assignAsCommander assignAsDriver assignAsGunner assignTeam assignToAirport assignedCargo assignedCommander assignedDriver assignedGunner assignedTarget assignedTeam assignedVehicle assignedVehicleRole atan atan2 atg attachObject attachTo attachedObject attackEnabled backpackSpaceFor behaviour benchmark boundingBox boundingCenter breakOut breakTo buildingExit buildingPos buttonAction buttonSetAction cadetMode callExtension camCommand camCommit camCommitPrepared camCommitted camConstuctionSetParams camCreate camDestroy camPreload camPreloaded camPrepareBank camPrepareDir camPrepareDive camPrepareFocus camPrepareFov camPrepareFovRange camPreparePos camPrepareRelPos camPrepareTarget camSetBank camSetDir camSetDive camSetFocus camSetFov camSetFovRange camSetPos camSetRelPos camSetTarget camTarget camUseNVG cameraEffect cameraEffectEnableHUD cameraInterest cameraOn cameraView campaignConfigFile canFire canMove canStand canUnloadInCombat captive captiveNum ceil cheatsEnabled checkAIFeature civilian clearBackpackCargoGlobal clearGroupIcons clearMagazineCargo clearMagazineCargoGlobal clearMagazinePool clearOverlay clearRadio clearVehicleInit clearWeaponCargo clearWeaponCargoGlobal clearWeaponPool closeDialog closeDisplay closeOverlay collapseObjectTree combatMode commandChat commandFSM commandFire commandFollow commandGetOut commandMove commandRadio commandStop commandTarget commandWatch commander commandingMenu comment commitOverlay compile completedFSM composeText configFile configName controlNull copyFromClipboard copyToClipboard copyWaypoints cos count countEnemy countFriendly countSide countType countUnknown createAgent createCenter createDialog createDiaryLink createDiaryRecord createDiarySubject createDisplay createGearDialog createGroup createGuardedPoint createLocation createMarker createMarkerLocal createMenu createMine createMissionDisplay createSimpleTask createSoundSource createTask createTeam createTrigger createUnit createVehicle createVehicleLocal crew ctrlActivate ctrlAddEventHandler ctrlAutoScrollDelay ctrlAutoScrollRewind ctrlAutoScrollSpeed ctrlCommit ctrlCommitted ctrlEnable ctrlEnabled ctrlFade ctrlMapAnimAdd ctrlMapAnimClear ctrlMapAnimCommit ctrlMapAnimDone ctrlMapCursor ctrlMapMouseOver ctrlMapScale ctrlMapScreenToWorld ctrlMapWorldToScreen ctrlParent ctrlPosition ctrlRemoveAllEventHandlers ctrlRemoveEventHandler ctrlScale ctrlSetActiveColor ctrlSetAutoScrollDelay ctrlSetAutoScrollRewind ctrlSetAutoScrollSpeed ctrlSetBackgroundColor ctrlSetEventHandler ctrlSetFade ctrlSetFocus ctrlSetFont ctrlSetFontH1 ctrlSetFontH1B ctrlSetFontH2 ctrlSetFontH2B ctrlSetFontH3 ctrlSetFontH3B ctrlSetFontH4 ctrlSetFontH4B ctrlSetFontH5 ctrlSetFontH5B ctrlSetFontH6 ctrlSetFontH6B ctrlSetFontHeight ctrlSetFontHeightH1 ctrlSetFontHeightH2 ctrlSetFontHeightH3 ctrlSetFontHeightH4 ctrlSetFontHeightH5 ctrlSetFontHeightH6 ctrlSetFontP ctrlSetFontPB ctrlSetForegroundColor ctrlSetPosition ctrlSetScale ctrlSetStructuredText ctrlSetText ctrlSetTextColor ctrlSetTooltip ctrlSetTooltipColorBox ctrlSetTooltipColorShade ctrlSetTooltipColorText ctrlShow ctrlShown ctrlText ctrlType ctrlVisible currentCommand currentMagazine currentMuzzle currentTask currentTasks currentVisionMode currentWaypoint currentWeapon currentWeaponMode currentZeroing cursorTarget cutFadeOut cutObj cutRsc cutText damage date dateToNumber daytime deActivateKey debugFSM debugLog deg deleteCenter deleteCollection deleteEditorObject deleteGroup deleteIdentity deleteLocation deleteMarker deleteMarkerLocal deleteResources deleteStatus deleteTeam deleteVehicle deleteWaypoint detach diag_captureFrame diag_captureSlowFrame diag_fps diag_fpsmin diag_frameno diag_log diag_logSlowFrame diag_tickTime dialog diarySubjectExists difficultyEnabled directSay direction disableAI disableConversation disableSerialization disableTIEquipment disableUserInput displayAddEventHandler displayCtrl displayNull displayRemoveAllEventHandlers displayRemoveEventHandler displaySetEventHandler dissolveTeam distance distributionRegion doFSM doFire doFollow doGetOut doMove doStop doTarget doWatch drawArrow drawEllipse drawIcon drawLine drawLink drawLocation drawRectangle driver drop east echo editObject editorSetEventHandler effectiveCommander emptyPositions enableAI enableAIFeature enableAttack enableCamShake enableEndDialog enableEngineArtillery enableEnvironment enableGunLights enableIRLasers enableRadio enableReload enableSaving enableSentences enableSimulation enableTeamSwitch endLoadingScreen endMission engineOn estimatedEndServerTime estimatedTimeLeft evalObjectArgument execEditorScript execFSM exp expectedDestination eyePos faction fadeMusic fadeRadio fadeSound fadeSpeech failMission fillWeaponsFromPool find findCover findDisplay findEditorObject findEmptyPosition findEmptyPositionReady findNearestEnemy finishMissionInit finite fire fireAtTarget flag flagOwner fleeing floor flyInHeight fog fogForecast forEachMember forEachMemberAgent forEachMemberTeam forceEnd forceMap forceSpeed forceWalk formLeader format formatText formation formationDirection formationLeader formationMembers formationPosition formationTask fromEditor fuel gearSlotData getArray getBackpackCargo getDammage getDir getEditorCamera getEditorMode getEditorObjectScope getElevationOffset getFSMVariable getFriend getGroupIcon getGroupIconParams getGroupIcons getHideFrom getMagazineCargo getMarkerColor getMarkerPos getMarkerSize getMarkerType getNumber getObjectArgument getObjectChildren getObjectProxy getPlayerUID getPos getPosASL getPosATL getResolution getSpeed getTerrainHeightASL getText getVariable getWPPos getWeaponCargo glanceAt globalChat globalRadio goto group groupChat groupIconSelectable groupIconsVisible groupRadio groupSelectUnit groupSelectedUnits grpNull gunner halt handsHit hasInterface hasWeapon hcAllGroups hcGroupParams hcLeader hcRemoveAllGroups hcRemoveGroup hcSelectGroup hcSelected hcSetGroup hcShowBar hcShownBar hideBody hideObject hint hintC hintCadet hintSilent hostMission htmlLoad image importAllGroups importance in inGameUISetEventHandler inflame inflamed inheritsFrom initAmbientLife inputAction insertEditorObject intersect isAgent isArray isAutoHoverOn isClass isDedicated isEngineOn isFlatEmpty isForcedWalk isFormationLeader isHidden isKeyActive isKindOf isManualFire isMarkedForCollection isMultiplayer isNil isNull isNumber isOnRoad isPlayer isRealTime isServer isShowing3DIcons isText isWalking items join joinAs joinAsSilent joinSilent kbAddDatabase kbAddDatabaseTargets kbAddTopic kbHasTopic kbReact kbRemoveTopic kbTell kbWasSaid keyImage keyName knowsAbout land landAt landResult laserTarget lbAdd lbClear lbColor lbCurSel lbData lbDelete lbIsSelected lbPicture lbSelection lbSetColor lbSetCurSel lbSetData lbSetPicture lbSetSelected lbSetValue lbSize lbSort lbSortByValue lbText lbValue leader leaveVehicle libraryCredits libraryDisclaimers lifeState lightAttachObject lightDetachObject lightIsOn limitSpeed lineBreak lineIntersects lineIntersectsWith list listObjects ln lnbAddArray lnbAddColumn lnbAddRow lnbClear lnbColor lnbCurSelRow lnbData lnbDeleteColumn lnbDeleteRow lnbGetColumnsPosition lnbPicture lnbSetColor lnbSetCurSelRow lnbSetData lnbSetPicture lnbSetText lnbSetValue lnbSize lnbText lnbValue lnbsetColumnsPos loadFile loadGame loadIdentity loadMagazine loadOverlay loadStatus local localize locationNull locationPosition lock lockCargo lockDriver lockTurret lockWp locked lockedCargo lockedDriver lockedTurret log lookAt lookAtPos magazines magazinesTurret mapAnimAdd mapAnimClear mapAnimCommit mapAnimDone mapCenterOnCamera mapGridPosition markerAlpha markerBrush markerColor markerDir markerPos markerShape markerSize markerText markerType max members min missionConfigFile missionName missionNamespace missionStart mod modelToWorld moonIntensity morale move moveInCargo moveInCommander moveInDriver moveInGunner moveInTurret moveObjectToEnd moveOut moveTime moveTo moveToCompleted moveToFailed musicVolume nMenuItems name nearEntities nearObjects nearObjectsReady nearRoads nearTargets nearestBuilding nearestLocation nearestLocationWithDubbing nearestLocations nearestObject nearestObjects needReload newOverlay nextMenuItemIndex nextWeatherChange numberToDate objNull objStatus onBriefingGroup onBriefingNotes onBriefingPlan onBriefingTeamSwitch onCommandModeChanged onDoubleClick onEachFrame onGroupIconClick onGroupIconOverEnter onGroupIconOverLeave onHCGroupSelectionChanged onMapSingleClick onPlayerConnected onPlayerDisconnected onPreloadFinished onPreloadStarted onShowNewObject onTeamSwitch openDSInterface openMap orderGetIn overcast overcastForecast owner parseNumber parseText parsingNamespace pickWeaponPool playAction playActionNow playGesture playMission playMove playMoveNow playMusic playScriptedMission playSound playableUnits player playerRespawnTime playerSide playersNumber plus posScreenToWorld posWorldToScreen position positionCameraToWorld ppEffectAdjust ppEffectCommit ppEffectCommitted ppEffectCreate ppEffectDestroy ppEffectEnable precision preloadCamera preloadObject preloadSound preloadTitleObj preloadTitleRsc preprocessFileLineNumbers primaryWeapon priority processDiaryLink processInitCommands productVersion profileNamespace progressLoadingScreen progressPosition progressSetPosition publicVariable publicVariableClient publicVariableServer putWeaponPool queryMagazinePool queryWeaponPool rad radioVolume rain random rank rankId rating rectangular registerTask registeredTasks reload reloadEnabled remoteControl removeAction removeAllEventHandlers removeAllItems removeAllMPEventHandlers removeAllWeapons removeBackpack removeDrawIcon removeDrawLinks removeEventHandler removeGroupIcon removeMPEventHandler removeMagazine removeMagazineTurret removeMagazines removeMagazinesTurret removeMenuItem removeSimpleTask removeSwitchableUnit removeTeamMember removeWeapon requiredVersion resetCamShake resistance resize resources respawnVehicle restartEditorCamera reveal reversedMouseY roadsConnectedTo round runInitScript safeZoneH safeZoneW safeZoneWAbs safeZoneX safeZoneXAbs safeZoneY saveGame saveIdentity saveOverlay saveProfileNamespace saveStatus saveVar savingEnabled say say2D say3D scopeName score scoreSide screenToWorld scriptDone scriptName scudState secondaryWeapon select selectBestPlaces selectDiarySubject selectEditorObject selectLeader selectNoPlayer selectPlayer selectWeapon selectedEditorObjects selectionPosition sendSimpleCommand sendTask sendTaskResult sendUDPMessage serverCommand serverCommandAvailable serverTime set setAccTime setAirportSide setAmmoCargo setAperture setArmoryPoints setAttributes setBehaviour setCamShakeDefParams setCamShakeParams setCamUseTi setCameraInterest setCaptive setCombatMode setCurrentTask setCurrentWaypoint setDamage setDammage setDate setDestination setDir setDirection setDrawIcon setDropInterval setEditorMode setEditorObjectScope setEffectCondition setFSMVariable setFace setFaceAnimation setFlagOwner setFlagSide setFlagTexture setFog setFormDir setFormation setFormationTask setFriend setFromEditor setFuel setFuelCargo setGroupIcon setGroupIconParams setGroupIconsSelectable setGroupIconsVisible setGroupId setHideBehind setHit setIdentity setImportance setLeader setLightAmbient setLightBrightness setLightColor setMarkerAlpha setMarkerAlphaLocal setMarkerBrush setMarkerBrushLocal setMarkerColor setMarkerColorLocal setMarkerDir setMarkerDirLocal setMarkerPos setMarkerPosLocal setMarkerShape setMarkerShapeLocal setMarkerSize setMarkerSizeLocal setMarkerText setMarkerTextLocal setMarkerType setMarkerTypeLocal setMimic setMousePosition setMusicEffect setName setObjectArguments setObjectProxy setObjectTexture setOvercast setOwner setParticleCircle setParticleParams setParticleRandom setPlayable setPlayerRespawnTime setPos setPosASL setPosASL2 setPosATL setPosition setRadioMsg setRain setRank setRectangular setRepairCargo setSide setSimpleTaskDescription setSimpleTaskDestination setSimpleTaskTarget setSize setSkill setSoundEffect setSpeedMode setTargetAge setTaskResult setTaskState setTerrainGrid setText setTitleEffect setToneMapping setToneMappingParams setTriggerActivation setTriggerArea setTriggerStatements setTriggerText setTriggerTimeout setTriggerType setType setUnconscious setUnitAbility setUnitPos setUnitPosWeak setUnitRank setUnitRecoilCoefficient setVariable setVectorDir setVectorDirAndUp setVectorUp setVehicleAmmo setVehicleArmor setVehicleId setVehicleInit setVehicleLock setVehiclePosition setVehicleTiPars setVehicleVarName setVelocity setVelocityTransformation setViewDistance setVisibleIfTreeCollapsed setWPPos setWaypointBehaviour setWaypointCombatMode setWaypointCompletionRadius setWaypointDescription setWaypointFormation setWaypointHousePosition setWaypointPosition setWaypointScript setWaypointSpeed setWaypointStatements setWaypointTimeout setWaypointType setWaypointVisible setWeaponReloadingTime setWind show3DIcons showCinemaBorder showCommandingMenu showCompass showGPS showHUD showLegend showMap showNewEditorObject showPad showRadio showSubtitles showWarrant showWatch showWaypoint shownCompass shownGPS shownMap shownPad shownRadio shownWarrant shownWatch side sideChat sideEnemy sideFriendly sideLogic sideRadio sideUnknown simpleTasks simulationEnabled sin size sizeOf skill skipTime sleep sliderPosition sliderRange sliderSetPosition sliderSetRange sliderSetSpeed sliderSpeed someAmmo soundVolume speed speedMode sqrt startLoadingScreen stop stopped str sunOrMoon supportInfo suppressFor surfaceIsWater surfaceNormal surfaceType switchAction switchCamera switchGesture switchLight switchMove switchableUnits synchronizeObjectsAdd synchronizeObjectsRemove synchronizeTrigger synchronizeWaypoint synchronizedObjects tan targetsAggregate targetsQuery taskChildren taskCompleted taskDescription taskDestination taskHint taskNull taskParent taskResult taskState teamMember teamMemberNull teamName teamSwitch teamSwitchEnabled teamType teams terminate terrainIntersect terrainIntersectASL text textLog textLogFormat tg time titleCut titleFadeOut titleObj titleRsc titleText toArray toLower toString toUpper triggerActivated triggerActivation triggerArea triggerAttachObject triggerAttachVehicle triggerAttachedVehicle triggerStatements triggerText triggerTimeout triggerType turretUnit type typeName typeOf uiNamespace uiSleep unassignTeam unassignVehicle unitBackpack unitPos unitReady unitRecoilCoefficient units unitsBelowHeight unlockAchievement unregisterTask updateDrawIcon updateMenuItem updateObjectTree useAudioTimeForMoves vectorDir vectorUp vehicle vehicleChat vehicleRadio vehicleVarName vehicles velocity verifySignature viewDistance visibleMap visiblePosition visiblePositionASL waitUntil waypointAttachObject waypointAttachVehicle waypointAttachedObject waypointAttachedVehicle waypointBehaviour waypointCombatMode waypointCompletionRadius waypointDescription waypointFormation waypointHousePosition waypointPosition waypointScript waypointShow waypointSpeed waypointStatements waypointTimeout waypointType waypointVisible waypoints weaponDirection weaponState weapons weaponsTurret west wind worldName worldToModel worldToScreen',
      sqf_literal = 'DIK_0 DIK_1 DIK_2 DIK_3 DIK_4 DIK_5 DIK_6 DIK_7 DIK_8 DIK_9 DIK_A DIK_ABNT_C1 DIK_ABNT_C2 DIK_ADD DIK_APOSTROPHE DIK_APPS DIK_AT DIK_AX DIK_B DIK_BACK DIK_BACKSLASH DIK_BACKSPACE DIK_C DIK_CALCULATOR DIK_CAPITAL DIK_CAPSLOCK DIK_CIRCUMFLEX DIK_COLON DIK_COMMA DIK_CONVERT DIK_D DIK_DECIMAL DIK_DELETE DIK_DIVIDE DIK_DOWN DIK_DOWNARROW DIK_E DIK_END DIK_EQUALS DIK_ESCAPE DIK_F DIK_F1 DIK_F10 DIK_F11 DIK_F12 DIK_F13 DIK_F14 DIK_F15 DIK_F2 DIK_F3 DIK_F4 DIK_F5 DIK_F6 DIK_F7 DIK_F8 DIK_F9 DIK_G DIK_GRAVE DIK_H DIK_HOME DIK_I DIK_INSERT DIK_J DIK_K DIK_KANA DIK_KANJI DIK_L DIK_LALT DIK_LBRACKET DIK_LCONTROL DIK_LEFT DIK_LEFTARROW DIK_LMENU DIK_LSHIFT DIK_LWIN DIK_M DIK_MAIL DIK_MEDIASELECT DIK_MEDIASTOP DIK_MINUS DIK_MULTIPLY DIK_MUTE DIK_MYCOMPUTER DIK_N DIK_NEXT DIK_NEXTTRACK DIK_NOCONVERT DIK_NUMLOCK DIK_NUMPAD0 DIK_NUMPAD1 DIK_NUMPAD2 DIK_NUMPAD3 DIK_NUMPAD4 DIK_NUMPAD5 DIK_NUMPAD6 DIK_NUMPAD7 DIK_NUMPAD8 DIK_NUMPAD9 DIK_NUMPADCOMMA DIK_NUMPADENTER DIK_NUMPADEQUALS DIK_NUMPADMINUS DIK_NUMPADPERIOD DIK_NUMPADPLUS DIK_NUMPADSLASH DIK_NUMPADSTAR DIK_O DIK_OEM_102 DIK_P DIK_PAUSE DIK_PERIOD DIK_PGDN DIK_PGUP DIK_PLAYPAUSE DIK_POWER DIK_PREVTRACK DIK_PRIOR DIK_Q DIK_R DIK_RALT DIK_RBRACKET DIK_RCONTROL DIK_RETURN DIK_RIGHT DIK_RIGHTARROW DIK_RMENU DIK_RSHIFT DIK_RWIN DIK_S DIK_SCROLL DIK_SEMICOLON DIK_SLASH DIK_SLEEP DIK_SPACE DIK_STOP DIK_SUBTRACT DIK_SYSRQ DIK_T DIK_TAB DIK_U DIK_UNDERLINE DIK_UNLABELED DIK_UP DIK_UPARROW DIK_V DIK_VOLUMEDOWN DIK_VOLUMEUP DIK_W DIK_WAKE DIK_WEBBACK DIK_WEBFAVORITES DIK_WEBFORWARD DIK_WEBHOME DIK_WEBREFRESH DIK_WEBSEARCH DIK_WEBSTOP DIK_X DIK_Y DIK_YEN DIK_Z _ __ManPosBinoc __ManPosBinocLying __ManPosBinocStand __ManPosCombat __ManPosCrouch __ManPosDead __ManPosHandGunCrouch __ManPosHandGunLying __ManPosHandGunStand __ManPosLying __ManPosLyingNoWeapon __ManPosNoActions __ManPosNoWeapon __ManPosStand __ManPosSwimming __ManPosWeapon __ReadAndCreate __ReadAndWrite __ReadOnly __ReadOnlyVerified __TCivilian __TEast __TEnemy __TFriendly __TGuerrila __TLogic __TSideUnknown __TWest __WeaponHardMounted __WeaponNoSlot __WeaponSlotBinocular __WeaponSlotHandGun __WeaponSlotHandGunItem __WeaponSlotHandGunMag __WeaponSlotInventory __WeaponSlotItem __WeaponSlotMachinegun __WeaponSlotMag __WeaponSlotPrimary __WeaponSlotSecondary __callFile __change __checkBit __common_macro_present __compileFile __config_macro_present __currentLang __currentLangAbbr __dec __errorLog __false __for __forConf __frac __getBit __grep __grepArray __inc __int __isArray __isBool __isBoolean __isCode __isConfig __isControl __isDiary __isDisplay __isFunction __isGroup __isHandle __isNumber __isObject __isSGML __isScalar __isScript __isSide __isString __isTask __isTeamMember __isText __item __itemr __lib __localeLang __localeLangAbbr __log2 __logN __mGet __mSet __makeErrorText __makeMessageText __map __mapArray __mathInf __messageLog __module_name __nsGet __nsGetDefault __nsSet __nsSetGlobal __ns_prefix __pGet __pSet __pop __private __profiler __profilerEnd __profilerStart __profiler_macro_present __project_name __protected __public __push __pushTo __q __randomSelect __sqf2str __toRange __top __true __uiGet __uiSet __writeTop __xor _this _x and arg argIfExist argIfType argOr call case catch def default do else exec execVM exit exitWith false for foreach from func h if ifArgType ifExistArg invoke nil not or pi preprocessFile private private1 private2 private3 private4 private5 private6 private7 private8 private9 spawn step switch then this throw to true try var w while with x y z';

  window['-SQF-KEYWORDS-'] = sqf_keyword + ' ' + sqf_literal;

  return {
    cI: true,
    k: {
      keyword: sqf_keyword.toLowerCase(),
      literal: sqf_literal.toLowerCase()
    },
    //i: 'class\s*\w+(\s*:\s*\w+)?\s*\{',
    c: [
      hljs.CLCM,
      hljs.CBCM,
      { // preprocessor directives
        cN: 'preprocessor',
        b: '#(?:(?:include)|(?:define)|(?:undef)|(?:ifdef)|(?:ifndef)|(?:else)|(?:endif))'
      },
      { // preprocessor directives
        cN: 'preprocessor',
        b: '\\b__(?:(?:LINE)|(?:FILE)|(?:EXEC)|(?:EVAL))__\\b'
      },
      { // macro name
        cN: 'preprocessor',
        b: '\\b__[a-zA-Z0-9_]+'
      },
      { // double quoted string
        cN: 'string',
        b: '"((?:[^"])|(?:""))*"',
        r: 0
      },
      { // single quoted string
        cN: 'string',
        b: "'((?:[^'])|(?:''))*'",
        r: 0
      },
      { // local vriable
        cN: 'variable',
        b: '\\b_[a-zA-Z0-9_]+'
      },
      { // cba_fnc_
        cN: 'cba_fnc_',
        b: '\\CBA_fnc_[a-zA-Z0-9_]+'
      },
      { // bis_fnc_
        cN: 'BIS_fnc_',
        b: '\\BIS_fnc_[a-zA-Z0-9_]+'
      }
    ]
  };
});

hljs.registerLanguage('xml', function(hljs) {
  var XML_IDENT_RE = '[A-Za-z0-9\\._:-]+';
  var PHP = {
    b: /<\?(php)?(?!\w)/, e: /\?>/,
    sL: 'php', subLanguageMode: 'continuous'
  };
  var TAG_INTERNALS = {
    eW: true,
    i: /</,
    r: 0,
    c: [
      PHP,
      {
        cN: 'attribute',
        b: XML_IDENT_RE,
        r: 0
      },
      {
        b: '=',
        r: 0,
        c: [
          {
            cN: 'value',
            v: [
              {b: /"/, e: /"/},
              {b: /'/, e: /'/},
              {b: /[^\s\/>]+/}
            ]
          }
        ]
      }
    ]
  };
  return {
    aliases: ['html', 'xhtml', 'rss', 'atom', 'xsl', 'plist'],
    cI: true,
    c: [
      {
        cN: 'doctype',
        b: '<!DOCTYPE', e: '>',
        r: 10,
        c: [{b: '\\[', e: '\\]'}]
      },
      {
        cN: 'comment',
        b: '<!--', e: '-->',
        r: 10
      },
      {
        cN: 'cdata',
        b: '<\\!\\[CDATA\\[', e: '\\]\\]>',
        r: 10
      },
      {
        cN: 'tag',
        /*
        The lookahead pattern (?=...) ensures that 'begin' only matches
        '<style' as a single word, followed by a whitespace or an
        ending braket. The '$' is needed for the lexeme to be recognized
        by hljs.subMode() that tests lexemes outside the stream.
        */
        b: '<style(?=\\s|>|$)', e: '>',
        k: {title: 'style'},
        c: [TAG_INTERNALS],
        starts: {
          e: '</style>', rE: true,
          sL: 'css'
        }
      },
      {
        cN: 'tag',
        // See the comment in the <style tag about the lookahead pattern
        b: '<script(?=\\s|>|$)', e: '>',
        k: {title: 'script'},
        c: [TAG_INTERNALS],
        starts: {
          e: '</script>', rE: true,
          sL: 'javascript'
        }
      },
      {
        b: '<%', e: '%>',
        sL: 'vbscript'
      },
      PHP,
      {
        cN: 'pi',
        b: /<\?\w+/, e: /\?>/,
        r: 10
      },
      {
        cN: 'tag',
        b: '</?', e: '/?>',
        c: [
          {
            cN: 'title', b: '[^ /><]+', r: 0
          },
          TAG_INTERNALS
        ]
      }
    ]
  };
});

