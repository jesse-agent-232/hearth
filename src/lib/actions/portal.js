// `<div use:portal>`: move a node to document.body, so its position:fixed
// coordinates resolve to the viewport even when an ancestor has a
// transform or filter (which otherwise becomes the containing block).
export function portal(node) {
	if (typeof document === 'undefined') return;
	document.body.appendChild(node);
	return {
		destroy() {
			if (node.parentNode === document.body) document.body.removeChild(node);
		}
	};
}
