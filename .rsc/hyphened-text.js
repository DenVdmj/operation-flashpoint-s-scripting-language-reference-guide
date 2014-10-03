
(function () {

  var

  _forEachTextNode = function (root, callback) {
    function _walk (node) {
      if (node && node.nodeType === 3) {
        callback(node);
      }
      if (node && node.tagName && _ignoredTags[node.tagName]) {
        return
      }
      for (var el = node.firstChild; el !== null; el = el.nextSibling) {
        _walk(el);
      }
    }
    _walk(root);
  },

  /*
  Данный алгоритм предназначен для автоматической расстановки переносов в русских текстах.
  Точное его происхождение неизвестно, по сети он бродит под именем "алгоритм П. Хpистова в модификации Дымченко и Ваpсанофьева".

  Описание:
    'х'  - одна из 'ьъй',
    'c'  - согласная,
    'г'  - гласная,
    '-'  - вставляемый знак переноса
  К тексту последовательно применяются шесть правил-замен:
    х    -->  х-
    гг   -->  г-г
    гссг   -->  гс-сг
    сгсг   -->  сг-сг
    гсссг  -->  гс-ссг
    гссссг -->  гсс-ссг
  */

  RusA = '[абвгдеёжзийклмнопрстуфхцчшщъыьэюя]',
  RusV = '[аеёиоуыэю\я]',
  RusN = '[бвгджзклмнпрстфхцчшщ]',
  RusX = '[йъь]',
  Hyphen = '$1\xAD$2';

  re1 = new RegExp('('+RusX+')('+RusA+RusA+')', 'ig'),
  re2 = new RegExp('('+RusV+')('+RusV+RusA+')', 'ig'),
  re3 = new RegExp('('+RusV+RusN+')('+RusN+RusV+')', 'ig'),
  re4 = new RegExp('('+RusN+RusV+')('+RusN+RusV+')', 'ig'),
  re5 = new RegExp('('+RusV+RusN+')('+RusN+RusN+RusV+')', 'ig'),
  re6 = new RegExp('('+RusV+RusN+RusN+')('+RusN+RusN+RusV+')', 'ig'),

  hyphenate = function (root) {
    _forEachTextNode(root, function(node){
      node.nodeValue = (node.nodeValue
        .replace(/([^\wА-Яа-я])([\wА-Яа-я])\s+([\wА-Яа-я]+)/g, '$1$2\xA0$3')
        .replace(re1, Hyphen)
        .replace(re2, Hyphen)
        .replace(re3, Hyphen)
        .replace(re4, Hyphen)
        .replace(re5, Hyphen)
        .replace(re6, Hyphen)
        //.replace(/\b(\w+)\xAD/g, '$1')
      );
    });
  },

  _ignoredTags = {},

  _tagsList = (document.createElement('b').nodeName === 'b' ? ''.toString : ''.toUpperCase).call(
    'script|code|pre|img|br|samp|kbd|var|abbr|acronym|sub|sup|button|option|label|textarea|input|math|svg|h1|h2|h3|h4|h5|h6'
  ).split('|');

  while (_tagsList.length) {
    _ignoredTags[_tagsList.pop()] = true;
  };

  this.hyphenator = {
    config : function () {

    }
  };

  document.addEventListener('DOMContentLoaded', function () {
    hyphenate(document.body)
  }, false);

})();

