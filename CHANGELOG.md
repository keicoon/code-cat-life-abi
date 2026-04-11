# Changelog

All notable changes to this project will be documented in this file.

## 0.1.0

- added a Status Bar cat indicator with sleep/out state display
- added a dedicated log channel and movement diagnostics for jump/fall debugging
- added a short landing pause after jump/fall so consecutive vertical moves feel more natural

## 0.0.6

- fixed cat permanently disappearing after repeated spawn/despawn cycles
- fixed crash in physics reset when cat was mid-jump/fall (fractional line access)
- added rendering guard to prevent decoration updates from triggering scroll listener feedback loop
- added safety guards to event handlers to skip unnecessary despawn when cat is inactive

## 0.0.5

- fixed preview GIF reference in README

## 0.0.4

- updated extension icon to running cat sprite (cat_2_right)

## 0.0.3

- polished README for marketplace/release use
- added preview GIF generation workflow and bundled preview asset
- added MIT `LICENSE`
- added package metadata for release and issue tracking
- switched packaging scripts to `@vscode/vsce`

## 0.0.2

- refined jump/fall path generation for more natural diagonal movement
- scaled multi-line vertical stride by line distance with safe zero fallback
- split post-eat hold pose from session-ending sleep behavior
- updated settings to match current session/sleep model
- added regression tests for movement, post-eat hold, and session sleep

## 0.0.1

- initial playable Code Cat Life Abi prototype
