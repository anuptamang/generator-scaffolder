/**
 * Magento
 *
 * NOTICE OF LICENSE
 *
 * This source file is subject to the Academic Free License (AFL 3.0)
 * that is bundled with this package in the file LICENSE_AFL.txt.
 * It is also available through the world-wide-web at this URL:
 * http://opensource.org/licenses/afl-3.0.php
 * If you did not receive a copy of the license and are unable to
 * obtain it through the world-wide-web, please send an email
 * to license@magentocommerce.com so we can send you a copy immediately.
 *
 * DISCLAIMER
 *
 * Do not edit or add to this file if you wish to upgrade Magento to newer
 * versions in the future. If you wish to customize Magento for your
 * needs please refer to http://www.magentocommerce.com for more information.
 *
 * @category    design
 * @package     default_default
 * @copyright   Copyright (c) 2014 Magento Inc. (http://www.magentocommerce.com)
 * @license     http://opensource.org/licenses/afl-3.0.php  Academic Free License (AFL 3.0)
 */
function Minicart(options) {
  this.formKey = options.formKey;
  this.previousVal = null;

  this.defaultErrorMessage = 'Error occurred. Try to refresh page.';

  this.selectors = {
    itemRemove: '#cart-sidebar .remove',
    container: '#header-cart',
    inputQty: '.cart-item-quantity',
    qty: 'div.header-minicart span.count',
    overlay: '.minicart-wrapper',
    error: '#minicart-error-message',
    success: '#minicart-success-message',
    quantityButtonPrefix: '#qbutton-',
    quantityInputPrefix: '#qinput-',
    quantityButtonClass: '.quantity-button'
  };

  if (options.selectors) {
    $j.extend(this.selectors, options.selectors);
  }
}

Minicart.prototype = {
  init() {
    const cart = this;

    // bind remove event
    $j(this.selectors.itemRemove)
      .unbind('click.minicart')
      .bind('click.minicart', function(e) {
        e.preventDefault();
        cart.removeItem($j(this));
      });

    // bind update qty event
    $j(this.selectors.inputQty)
      .unbind('blur.minicart')
      .unbind('focus.minicart')
      .bind('focus.minicart', function() {
        cart.previousVal = $j(this).val();
        cart.displayQuantityButton($j(this));
      })
      .bind('blur.minicart', function() {
        cart.revertInvalidValue(this);
      });

    $j(this.selectors.quantityButtonClass)
      .unbind('click.quantity')
      .bind('click.quantity', function() {
        cart.processUpdateQuantity(this);
      });
  },

  removeItem(el) {
    const cart = this;
    if (confirm(el.data('confirm'))) {
      cart.hideMessage();
      cart.showOverlay();
      $j.ajax({
        type: 'POST',
        dataType: 'json',
        data: { form_key: cart.formKey },
        url: el.attr('href')
      })
        .done(result => {
          cart.hideOverlay();
          if (result.success) {
            cart.updateCartQty(result.qty);
            cart.updateContentOnRemove(result, el.closest('li'));
          } else {
            cart.showMessage(result);
          }
        })
        .error(() => {
          cart.hideOverlay();
          cart.showError(cart.defaultErrorMessage);
        });
    }
  },

  revertInvalidValue(el) {
    if (!this.isValidQty($j(el).val()) || $j(el).val() == this.previousVal) {
      $j(el).val(this.previousVal);
      this.hideQuantityButton(el);
    }
  },

  displayQuantityButton(el) {
    const buttonId = this.selectors.quantityButtonPrefix + $j(el).data('item-id');
    $j(buttonId)
      .addClass('visible')
      .attr('disabled', null);
  },

  hideQuantityButton(el) {
    const buttonId = this.selectors.quantityButtonPrefix + $j(el).data('item-id');
    $j(buttonId)
      .removeClass('visible')
      .attr('disabled', 'disabled');
  },

  processUpdateQuantity(el) {
    const input = $j(this.selectors.quantityInputPrefix + $j(el).data('item-id'));
    if (this.isValidQty(input.val()) && input.val() != this.previousVal) {
      this.updateItem(el);
    } else {
      this.revertInvalidValue(input);
    }
  },

  updateItem(el) {
    const cart = this;
    const input = $j(this.selectors.quantityInputPrefix + $j(el).data('item-id'));
    const quantity = parseInt(input.val(), 10);
    cart.hideMessage();
    cart.showOverlay();
    $j.ajax({
      type: 'POST',
      dataType: 'json',
      url: input.data('link'),
      data: { qty: quantity, form_key: cart.formKey }
    })
      .done(result => {
        cart.hideOverlay();
        if (result.success) {
          cart.updateCartQty(result.qty);
          if (quantity !== 0) {
            cart.updateContentOnUpdate(result);
          } else {
            cart.updateContentOnRemove(result, input.closest('li'));
          }
        } else {
          cart.showMessage(result);
        }
      })
      .error(() => {
        cart.hideOverlay();
        cart.showError(cart.defaultErrorMessage);
      });
    return false;
  },

  updateContentOnRemove(result, el) {
    const cart = this;
    el.hide('slow', () => {
      $j(cart.selectors.container).html(result.content);
      cart.showMessage(result);
    });
  },

  updateContentOnUpdate(result) {
    $j(this.selectors.container).html(result.content);
    this.showMessage(result);
  },

  updateCartQty(qty) {
    if (typeof qty !== 'undefined') {
      $j(this.selectors.qty).text(qty);
    }
  },

  isValidQty(val) {
    return val.length > 0 && val - 0 == val && val - 0 > 0;
  },

  showOverlay() {
    $j(this.selectors.overlay).addClass('loading');
  },

  hideOverlay() {
    $j(this.selectors.overlay).removeClass('loading');
  },

  showMessage(result) {
    if (typeof result.notice !== 'undefined') {
      this.showError(result.notice);
    } else if (typeof result.error !== 'undefined') {
      this.showError(result.error);
    } else if (typeof result.message !== 'undefined') {
      this.showSuccess(result.message);
    }
  },

  hideMessage() {
    $j(this.selectors.error).fadeOut('slow');
    $j(this.selectors.success).fadeOut('slow');
  },

  showError(message) {
    $j(this.selectors.error)
      .text(message)
      .fadeIn('slow');
  },

  showSuccess(message) {
    $j(this.selectors.success)
      .text(message)
      .fadeIn('slow');
  }
};
