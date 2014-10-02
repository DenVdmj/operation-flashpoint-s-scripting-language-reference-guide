
document.addEventListener('DOMContentLoaded', function () {

    var tooltipElement = document.createElement('div');
    var tooltipText = document.createElement('div');

    tooltipElement.id = 'x-tooltip';
    tooltipElement.style.position = 'absolute';
    tooltipElement.style.display = 'none';

    tooltipElement.onmousedown = function (event) {
        event.stopPropagation();
    };

    document.body.appendChild(tooltipElement);
    tooltipElement.appendChild(tooltipText);

    [].forEach.call(
        document.querySelectorAll('*[tooltip]'),
        function (node) {

            node.onmousedown = function (event) {

                tooltipText.innerHTML = this.getAttribute('tooltip').replace(/\n/gi, '<br />');

                tooltipElement.style.left = event.pageX + 'px';
                tooltipElement.style.top = event.pageY + 'px';
                tooltipElement.style.display = 'block';

                document.body.onmousedown = function (e) {
                    tooltipElement.style.display = 'none';
                    document.body.onmousedown = null;
                }

                event.stopPropagation();
            }
        }
    )
}, false)
