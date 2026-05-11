/**
 * File navigation.js.
 *
 * Handles toggling the navigation menu for small screens and enables TAB key
 * navigation support for dropdown menus.
 */

// polyfill forEach
// https://developer.mozilla.org/en-US/docs/Web/API/NodeList/forEach#Polyfill
if ( window.NodeList && ! NodeList.prototype.forEach ) {
	NodeList.prototype.forEach = function( callback, thisArg ) {
		var i;
		var len = this.length;

		thisArg = thisArg || window;

		for ( i = 0; i < len; i++ ) {
			callback.call( thisArg, this[ i ], i, this );
		}
	};
}

( function() {

	const navigationIds = ['site-navigation', 'top-navigation'];

	navigationIds.forEach(initNavigation);

	function initNavigation(navigationId) {

		const siteNavigation = document.getElementById(navigationId);

		// Return early if the navigation doesn't exist.
		if ( ! siteNavigation ) {
			return;
		}
	
		const menu = siteNavigation.getElementsByTagName( 'ul' )[ 0 ];
	
		// If menu is empty return early.
		if ( 'undefined' === typeof menu ) {
			return;
		}
	
		if ( ! menu.classList.contains( 'nav-menu' ) ) {
			menu.classList.add( 'nav-menu' );
		}
	
		// Get all the link elements within the menu.
		const links = menu.getElementsByTagName( 'a' );
	
		// Toggle focus each time a menu link is focused or blurred.
		for ( const link of links ) {
			link.addEventListener( 'focus', toggleFocus, true );
			link.addEventListener( 'blur', toggleFocus, true );
		}
	
		/**
		 * Sets or removes .focus class on an element.
		 */
		function toggleFocus(event) {
			if ( event.type === 'focus' || event.type === 'blur' ) {
				let self = this;
				// Move up through the ancestors of the current link until we hit .nav-menu.
				while ( ! self.classList.contains( 'nav-menu' ) ) {
					// On li elements toggle the class .focus.
					if ( 'li' === self.tagName.toLowerCase() ) {
						self.classList.toggle( 'focus' );
					}
					self = self.parentNode;
				}
			}
		}
	}
}() );

jQuery(document).ready(function(){

	var mobMainNav = jQuery('.responsive-mainnav'),
		mainNavUl = mobMainNav.find('ul#primary-menu'),
		mNavWrapper = jQuery('<div class="hm-nwrap"></div>');

	mNavWrapper.appendTo(mobMainNav);
	jQuery('#site-navigation ul:first-child').clone().appendTo(mNavWrapper);

	jQuery('#main-nav-button').on( "click", function(event){
		event.preventDefault();
		mobMainNav.slideToggle(0);
		mainNavUl.show();
	});
	
});

jQuery(document).ready(function(){

	var mobTopNav = jQuery('.responsive-topnav'),
	topNavUl = mobTopNav.find('ul#top-menu'),
	tNavWrapper = jQuery('<div class="hm-nwrap"></div>');

	tNavWrapper.appendTo(mobTopNav);
	jQuery('#top-navigation ul:first-child').clone().appendTo(tNavWrapper);

	jQuery('#top-nav-button').on( "click", function(event){
		event.preventDefault();
		mobTopNav.slideToggle(0);
		topNavUl.show();
	});
	
});