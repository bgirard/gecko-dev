/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set ft=javascript ts=2 et sw=2 tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EventEmitter = require("devtools/shared/event-emitter");
const {TooltipToggle} = require("devtools/client/shared/widgets/tooltip/TooltipToggle");

const XUL_NS = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
const XHTML_NS = "http://www.w3.org/1999/xhtml";

const POSITION = {
  TOP: "top",
  BOTTOM: "bottom",
};

module.exports.POSITION = POSITION;

const TYPE = {
  NORMAL: "normal",
  ARROW: "arrow",
};

module.exports.TYPE = TYPE;

const ARROW_WIDTH = 32;

// Default offset between the tooltip's left edge and the tooltip arrow.
const ARROW_OFFSET = 20;

const EXTRA_HEIGHT = {
  "normal": 0,
  // The arrow is 16px tall, but merges on 3px with the panel border
  "arrow": 13,
};

const EXTRA_BORDER = {
  "normal": 0,
  "arrow": 3,
};

/**
 * Calculate the vertical position & offsets to use for the tooltip. Will attempt to
 * respect the provided height and position preferences, unless the available height
 * prevents this.
 *
 * @param {DOMRect} anchorRect
 *        Bounding rectangle for the anchor, relative to the tooltip document.
 * @param {DOMRect} docRect
 *        Bounding rectange for the tooltip document owner.
 * @param {Number} height
 *        Preferred height for the tooltip.
 * @param {String} pos
 *        Preferred position for the tooltip. Possible values: "top" or "bottom".
 * @return {Object}
 *         - {Number} top: the top offset for the tooltip.
 *         - {Number} height: the height to use for the tooltip container.
 *         - {String} computedPosition: Can differ from the preferred position depending
 *           on the available height). "top" or "bottom"
 */
const calculateVerticalPosition = function (anchorRect, docRect, height, pos, offset) {
  let {TOP, BOTTOM} = POSITION;

  let {top: anchorTop, height: anchorHeight} = anchorRect;
  let {bottom: docBottom} = docRect;

  // Calculate available space for the tooltip.
  let availableTop = anchorTop;
  let availableBottom = docBottom - (anchorTop + anchorHeight);

  // Find POSITION
  let keepPosition = false;
  if (pos === TOP) {
    keepPosition = availableTop >= height + offset;
  } else if (pos === BOTTOM) {
    keepPosition = availableBottom >= height + offset;
  }
  if (!keepPosition) {
    pos = availableTop > availableBottom ? TOP : BOTTOM;
  }

  // Calculate HEIGHT.
  let availableHeight = pos === TOP ? availableTop : availableBottom;
  height = Math.min(height, availableHeight - offset);
  height = Math.floor(height);

  // Calculate TOP.
  let top = pos === TOP ? anchorTop - height - offset : anchorTop + anchorHeight + offset;

  return {top, height, computedPosition: pos};
};

/**
 * Calculate the vertical position & offsets to use for the tooltip. Will attempt to
 * respect the provided height and position preferences, unless the available height
 * prevents this.
 *
 * @param {DOMRect} anchorRect
 *        Bounding rectangle for the anchor, relative to the tooltip document.
 * @param {DOMRect} docRect
 *        Bounding rectange for the tooltip document owner.
 * @param {Number} width
 *        Preferred width for the tooltip.
 * @return {Object}
 *         - {Number} left: the left offset for the tooltip.
 *         - {Number} width: the width to use for the tooltip container.
 *         - {Number} arrowLeft: the left offset to use for the arrow element.
 */
const calculateHorizontalPosition = function (anchorRect, docRect, width, type, offset) {
  let {left: anchorLeft, width: anchorWidth} = anchorRect;
  let {right: docRight} = docRect;

  // Calculate WIDTH.
  let availableWidth = docRight;
  width = Math.min(width, availableWidth);

  // Calculate LEFT.
  // By default the tooltip is aligned with the anchor left edge. Unless this
  // makes it overflow the viewport, in which case is shifts to the left.
  let left = Math.min(anchorLeft + offset, docRight - width);

  // Calculate ARROW LEFT (tooltip's LEFT might be updated)
  let arrowLeft;
  // Arrow style tooltips may need to be shifted to the left
  if (type === TYPE.ARROW) {
    let arrowCenter = left + ARROW_OFFSET + ARROW_WIDTH / 2;
    let anchorCenter = anchorLeft + anchorWidth / 2;
    // If the anchor is too narrow, align the arrow and the anchor center.
    if (arrowCenter > anchorCenter) {
      left = Math.max(0, left - (arrowCenter - anchorCenter));
    }
    // Arrow's left offset relative to the anchor.
    arrowLeft = Math.min(ARROW_OFFSET, (anchorWidth - ARROW_WIDTH) / 2) | 0;
    // Translate the coordinate to tooltip container
    arrowLeft += anchorLeft - left;
    // Make sure the arrow remains in the tooltip container.
    arrowLeft = Math.min(arrowLeft, width - ARROW_WIDTH);
    arrowLeft = Math.max(arrowLeft, 0);
  }

  return {left, width, arrowLeft};
};

/**
 * Get the bounding client rectangle for a given node, relative to a custom
 * reference element (instead of the default for getBoundingClientRect which
 * is always the element's ownerDocument).
 */
const getRelativeRect = function (node, relativeTo) {
  // Width and Height can be taken from the rect.
  let {width, height} = node.getBoundingClientRect();

  let quads = node.getBoxQuads({relativeTo});
  let top = quads[0].bounds.top;
  let left = quads[0].bounds.left;

  // Compute right and bottom coordinates using the rest of the data.
  let right = left + width;
  let bottom = top + height;

  return {top, right, bottom, left, width, height};
};

/**
 * The HTMLTooltip can display HTML content in a tooltip popup.
 *
 * @param {Toolbox} toolbox
 *        The devtools toolbox, needed to get the devtools main window.
 * @param {Object}
 *        - {String} type
 *          Display type of the tooltip. Possible values: "normal", "arrow"
 *        - {Boolean} autofocus
 *          Defaults to false. Should the tooltip be focused when opening it.
 *        - {Boolean} consumeOutsideClicks
 *          Defaults to true. The tooltip is closed when clicking outside.
 *          Should this event be stopped and consumed or not.
 */
function HTMLTooltip(toolbox,
  {type = "normal", autofocus = false, consumeOutsideClicks = true} = {}) {
  EventEmitter.decorate(this);

  this.doc = toolbox.doc;
  this.type = type;
  this.autofocus = autofocus;
  this.consumeOutsideClicks = consumeOutsideClicks;

  // Use the topmost window to listen for click events to close the tooltip
  this.topWindow = this.doc.defaultView.top;

  this._onClick = this._onClick.bind(this);

  this._toggle = new TooltipToggle(this);
  this.startTogglingOnHover = this._toggle.start.bind(this._toggle);
  this.stopTogglingOnHover = this._toggle.stop.bind(this._toggle);

  this.container = this._createContainer();

  if (this._isXUL()) {
    this.doc.documentElement.appendChild(this.container);
  } else {
    // In non-XUL context the container is ready to use as is.
    this.doc.body.appendChild(this.container);
  }
}

module.exports.HTMLTooltip = HTMLTooltip;

HTMLTooltip.prototype = {
  /**
   * The tooltip panel is the parentNode of the tooltip content provided in
   * setContent().
   */
  get panel() {
    return this.container.querySelector(".tooltip-panel");
  },

  /**
   * The arrow element. Might be null depending on the tooltip type.
   */
  get arrow() {
    return this.container.querySelector(".tooltip-arrow");
  },

  /**
   * Set the tooltip content element. The preferred width/height should also be
   * specified here.
   *
   * @param {Element} content
   *        The tooltip content, should be a HTML element.
   * @param {Object}
   *        - {Number} width: preferred width for the tooltip container. If not specified
   *          the tooltip container will be measured before being displayed, and the
   *          measured width will be used as preferred width.
   *        - {Number} height: optional, preferred height for the tooltip container. This
   *          parameter acts as a max-height for the tooltip content. If not specified,
   *          the tooltip will be able to use all the height available.
   */
  setContent: function (content, {width = "auto", height = Infinity} = {}) {
    this.preferredWidth = width;
    this.preferredHeight = height;

    this.panel.innerHTML = "";
    this.panel.appendChild(content);
  },

  /**
   * Show the tooltip next to the provided anchor element. A preferred position
   * can be set. The event "shown" will be fired after the tooltip is displayed.
   *
   * @param {Element} anchor
   *        The reference element with which the tooltip should be aligned
   * @param {Object}
   *        - {String} position: optional, possible values: top|bottom
   *          If layout permits, the tooltip will be displayed on top/bottom
   *          of the anchor. If ommitted, the tooltip will be displayed where
   *          more space is available.
   *        - {Number} x: optional, horizontal offset between the anchor and the tooltip
   *        - {Number} y: optional, vertical offset between the anchor and the tooltip
   */
  show: function (anchor, {position, x = 0, y = 0} = {}) {
    // Get anchor geometry
    let anchorRect = getRelativeRect(anchor, this.doc);
    // Get document geometry
    let docRect = this.doc.documentElement.getBoundingClientRect();

    let themeHeight = EXTRA_HEIGHT[this.type] + 2 * EXTRA_BORDER[this.type];
    let preferredHeight = this.preferredHeight + themeHeight;

    let {top, height, computedPosition} =
      calculateVerticalPosition(anchorRect, docRect, preferredHeight, position, y);

    // Apply height and top information before measuring the content width (if "auto").
    let isTop = computedPosition === POSITION.TOP;
    this.container.classList.toggle("tooltip-top", isTop);
    this.container.classList.toggle("tooltip-bottom", !isTop);
    this.container.style.height = height + "px";
    this.container.style.top = top + "px";

    let themeWidth = 2 * EXTRA_BORDER[this.type];
    let preferredWidth = this.preferredWidth === "auto" ?
      this._measureContainerWidth() : this.preferredWidth + themeWidth;

    let {left, width, arrowLeft} =
      calculateHorizontalPosition(anchorRect, docRect, preferredWidth, this.type, x);

    this.container.style.width = width + "px";
    this.container.style.left = left + "px";

    if (this.type === TYPE.ARROW) {
      this.arrow.style.left = arrowLeft + "px";
    }

    this.container.classList.add("tooltip-visible");

    // Keep a pointer on the focused element to refocus it when hiding the tooltip.
    this._focusedElement = this.doc.activeElement;

    this.doc.defaultView.clearTimeout(this.attachEventsTimer);
    this.attachEventsTimer = this.doc.defaultView.setTimeout(() => {
      this._maybeFocusTooltip();
      this.topWindow.addEventListener("click", this._onClick, true);
      this.emit("shown");
    }, 0);
  },

  _measureContainerWidth: function () {
    this.container.classList.add("tooltip-hidden");
    this.container.style.left = "0px";
    this.container.style.width = "auto";
    let width = this.container.getBoundingClientRect().width;
    this.container.classList.remove("tooltip-hidden");
    return width;
  },

  /**
   * Hide the current tooltip. The event "hidden" will be fired when the tooltip
   * is hidden.
   */
  hide: function () {
    this.doc.defaultView.clearTimeout(this.attachEventsTimer);
    if (!this.isVisible()) {
      return;
    }

    this.topWindow.removeEventListener("click", this._onClick, true);
    this.container.classList.remove("tooltip-visible");
    this.emit("hidden");

    let tooltipHasFocus = this.container.contains(this.doc.activeElement);
    if (tooltipHasFocus && this._focusedElement) {
      this._focusedElement.focus();
      this._focusedElement = null;
    }
  },

  /**
   * Check if the tooltip is currently displayed.
   * @return {Boolean} true if the tooltip is visible
   */
  isVisible: function () {
    return this.container.classList.contains("tooltip-visible");
  },

  /**
   * Destroy the tooltip instance. Hide the tooltip if displayed, remove the
   * tooltip container from the document.
   */
  destroy: function () {
    this.hide();
    this.container.remove();
  },

  _createContainer: function () {
    let container = this.doc.createElementNS(XHTML_NS, "div");
    container.setAttribute("type", this.type);
    container.classList.add("tooltip-container");

    let html = '<div class="tooltip-filler"></div>';
    html += '<div class="tooltip-panel"></div>';

    if (this.type === TYPE.ARROW) {
      html += '<div class="tooltip-arrow"></div>';
    }
    container.innerHTML = html;
    return container;
  },

  _onClick: function (e) {
    if (this._isInTooltipContainer(e.target)) {
      return;
    }

    this.hide();
    if (this.consumeOutsideClicks) {
      e.preventDefault();
      e.stopPropagation();
    }
  },

  _isInTooltipContainer: function (node) {
    // Check if the target is the tooltip arrow.
    if (this.arrow && this.arrow === node) {
      return true;
    }

    let tooltipWindow = this.panel.ownerDocument.defaultView;
    let win = node.ownerDocument.defaultView;

    // Check if the tooltip panel contains the node if they live in the same document.
    if (win === tooltipWindow) {
      return this.panel.contains(node);
    }

    // Check if the node window is in the tooltip container.
    while (win.parent && win.parent != win) {
      if (win.parent === tooltipWindow) {
        // If the parent window is the tooltip window, check if the tooltip contains
        // the current frame element.
        return this.panel.contains(win.frameElement);
      }
      win = win.parent;
    }

    return false;
  },

  /**
   * Check if the tooltip's owner document is a XUL document.
   */
  _isXUL: function () {
    return this.doc.documentElement.namespaceURI === XUL_NS;
  },

  /**
   * If the tootlip is configured to autofocus and a focusable element can be found,
   * focus it.
   */
  _maybeFocusTooltip: function () {
    // Simplied selector targetting elements that can receive the focus, full version at
    // http://stackoverflow.com/questions/1599660/which-html-elements-can-receive-focus .
    let focusableSelector = "a, button, iframe, input, select, textarea";
    let focusableElement = this.panel.querySelector(focusableSelector);
    if (this.autofocus && focusableElement) {
      focusableElement.focus();
    }
  },
};
