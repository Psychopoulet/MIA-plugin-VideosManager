
"use strict";

// deps

	const	path = require('path'),
			fs = require('simplefs'),

			Categories = require(path.join(__dirname, 'database', 'categories.js')),
			Videos = require(path.join(__dirname, 'database', 'videos.js'));

// private

	// sql

		function _runSQLFile(Container, SQLFile) {

			return new Promise(function(resolve, reject) {

				try {

					fs.readFileProm(SQLFile, 'utf8').then(function(sql) {

						let queries = [];

						sql.split(';').forEach(function(query) {

							query = query.trim()
										.replace(/--(.*)\s/g, "")
										.replace(/\s/g, " ")
										.replace(/  /g, " ");

							if ('' != query) {
								queries.push(query + ';');
							}

						});

						function executeQueries(i) {

							return new Promise(function(resolve, reject) {

								if (i >= queries.length) {
									resolve();
								}
								else {

									Container.get('db').run(queries[i], [], function(err) {

										if (err) {
											reject((err.message) ? err.message : err);
										}
										else {
											executeQueries(i + 1).then(resolve).catch(reject);
										}

									});

								}

							});

						}

						executeQueries(0).then(resolve).catch(reject);

					}).catch(reject);

				}
				catch(e) {
					reject((e.message) ? e.message : e);
				}

			});

		}

	function _formateVideo(video) {

		if (-1 < video.url.indexOf('youtu')) {

			if (!video.code || '' == video.code) {

				if (-1 == video.url.indexOf('=')) {
					video.url = video.url.replace('youtu.be/', 'youtube.com/watch?v=');
				}

				video.code = video.url.replace(/&(.*)/, '').split('=')[1];
				
			}

			video.url = 'https://www.youtube.com/watch?v=' + video.code;
			video.urlembeded = 'https://www.youtube.com/embed/' + video.code;

		}
		else if (-1 < video.url.indexOf('dailymotion')) {

			if (!video.code || '' == video.code) {
				let parts = video.url.split('_')[0].split('/');
				video.code = parts[parts.length-1];
			}

			video.url = 'https://www.dailymotion.com/video/' + video.code;
			video.urlembeded = 'https://www.dailymotion.com/embed/video/' + video.code;

		}

		return video;

	}

	function _freeSocket(socket) {

		// categories

			socket.removeAllListeners('plugins.videos.category.add');
			socket.removeAllListeners('plugins.videos.category.edit');
			socket.removeAllListeners('plugins.videos.category.delete');

		// videos

			socket.removeAllListeners('plugins.videos.videos');

			socket.removeAllListeners('plugins.videos.video.add');
			socket.removeAllListeners('plugins.videos.video.edit');
			socket.removeAllListeners('plugins.videos.video.delete');

			socket.removeAllListeners('plugins.videos.video.playsound');
			socket.removeAllListeners('plugins.videos.video.playvideo');

	}

// module

module.exports = class MIAPluginVideosManager extends require('simplepluginsmanager').SimplePlugin {

	constructor () {
 
		super();
 
		this.categories = null;
		this.videos = null;

	}

	/*

	loadVideosByCategory (Container, category) {

		let tabVideos = [];

		try {

			Container.get('db').all("SELECT * FROM plugin_videos_videos WHERE id_category = :id_category;", { ':id_category': category.id }, function(err, rows) {

				if (err) {
					Container.get('logs').err('-- [plugins/VideosManager] - loadVideosByCategory : ' + ((err.message) ? err.message : err));
					socket.emit('plugins.videos.error', (err.message) ? err.message : err);
				}
				else {

					let videos = [];

					if (rows) {

						rows.forEach(function(video) {

							videos.push({
								urls : {
									normal: video.url
									embeded: video.urlembeded
								},
								code : video.code,
								name : video.name
							});

						});

					}

					Container.get('websockets').emit('plugins.videos.videos', videos);

				}

			});

		}
		catch(e) {
			Container.get('logs').err('-- [plugins/VideosManager] - loadVideosByCategory : ' + ((e.message) ? e.message : e));
			Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
		}

	}*/

	load (Container) {

		let that = this;

		return new Promise(function(resolve, reject) {

			try {

				Container.get('users').lastInserted().then(function(user) {

					that.categories = new Categories(Container.get('db'));
					that.videos = new Videos(Container.get('db'));

					Container.get('websockets').onDisconnect(_freeSocket).onLog(function(socket) {

						that.categories.searchByUser(user).then(function(categories) {
							socket.emit('plugins.videos.categories', categories);
						}).catch(function(err) {
							Container.get('logs').err('-- [plugins/VideosManager/categories/searchByUser] : ' + ((err.message) ? err.message : err));
							socket.emit('plugins.videos.error', (err.message) ? err.message : err);
						});

						// categories

							socket.on('plugins.videos.category.add', function (data) {

								if (Container.get('conf').get('debug')) {
									Container.get('logs').log('plugins.videos.category.add');
								}

								try {

									that.categories.searchByUserByName(user, data.name).then(function(category) {

										if (category) {
											socket.emit('plugins.videos.error', 'Cette catégorie existe déjà.');
										}
										else {
											
											that.categories.add({
												user: user,
												name : data.name
											}).then(function(category) {

												Container.get('websockets').emit('plugins.videos.category.added', category);

											}).catch(function(err) {
												Container.get('logs').err('-- [plugins/VideosManager/categories/add] : ' + err);
												socket.emit('plugins.videos.error', err);
											})

										}

									}).catch(function(err) {
										Container.get('logs').err('-- [plugins/VideosManager/categories/searchByUserByCode] : ' + err);
										socket.emit('plugins.videos.error', err);
									});

								}
								catch (e) {
									Container.get('logs').err('-- [plugins/VideosManagercategories/add] : ' + ((e.message) ? e.message : e));
									Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
								}

							})
							.on('plugins.videos.category.edit', function (data) {

								if (Container.get('conf').get('debug')) {
									Container.get('logs').log('plugins.videos.category.edit');
								}

								try {

									that.categories.searchById(data.id).then(function(category) {

										if (!category) {
											socket.emit('plugins.videos.error', 'Impossible de trouver cette catégorie.');
										}
										else {
													
											that.categories.searchByUserByName(user, data.name).then(function(_category) {

												if (_category) {
													socket.emit('plugins.videos.error', 'Ce nom existe déjà.');
												}
												else {

													category.name = data.name;

													that.categories.edit(category).then(function(category) {
														Container.get('websockets').emit('plugins.videos.category.edited', category);
													}).catch(function(err) {
														Container.get('logs').err('-- [plugins/VideosManager/categories/edit] : ' + err);
														socket.emit('plugins.videos.error', err);
													});

												}
													
											}).catch(function(err) {
												Container.get('logs').err('-- [plugins/VideosManager/categories/searchByUserByName] : ' + err);
												socket.emit('plugins.videos.error', err);
											});

										}
											
									}).catch(function(err) {
										Container.get('logs').err('-- [plugins/VideosManager/categories/searchById] : ' + err);
										socket.emit('plugins.videos.error', err);
									});

								}
								catch (e) {
									Container.get('logs').err('-- [plugins/VideosManager/categories/edit] : ' + ((e.message) ? e.message : e));
									Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
								}

							})
							.on('plugins.videos.category.delete', function (data) {

								if (Container.get('conf').get('debug')) {
									Container.get('logs').log('plugins.videos.category.delete');
								}

								try {

									that.categories.searchById(data.id).then(function(category) {

										if (!category) {
											socket.emit('plugins.videos.error', 'Impossible de trouver cette catégorie.');
										}
										else {

											that.categories.delete(category).then(function() {

												that.categories.searchByUser(user).then(function(categories) {
													socket.emit('plugins.videos.categories', categories);
												}).catch(function(err) {

													Container.get('logs').err('-- [plugins/VideosManager/categories/searchByUser] : ' + ((err.message) ? err.message : err));
													socket.emit('plugins.videos.error', (err.message) ? err.message : err);

												});
												
											}).catch(function(err) {
												Container.get('logs').err('-- [plugins/VideosManager/categories/delete] : ' + err);
												socket.emit('plugins.videos.error', err);
											});

										}
												
									}).catch(function(err) {
										Container.get('logs').err('-- [plugins/VideosManager/categories/searchById] : ' + err);
										socket.emit('plugins.videos.error', err);
									});

								}
								catch (e) {
									Container.get('logs').err('-- [plugins/VideosManager/categories/delete] : ' + ((e.message) ? e.message : e));
									Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
								}

							});

						// videos

							socket.on('plugins.videos.videos', function(category) {

								if (Container.get('conf').get('debug')) {
									Container.get('logs').log('plugins.videos.videos');
								}

								try {

									that.videos.searchByCategory(category).then(function(videos) {
										socket.emit('plugins.videos.videos', videos);
									}).catch(function(err) {
										Container.get('logs').err('-- [plugins/VideosManager/videos/searchByCategory] : ' + err);
										socket.emit('plugins.videos.error', err);
									});

								}
								catch (e) {
									Container.get('logs').err('-- [plugins/VideosManager/videos/searchByCategory] : ' + ((e.message) ? e.message : e));
									Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
								}

							})

							.on('plugins.videos.video.add', function (data) {

								if (Container.get('conf').get('debug')) {
									Container.get('logs').log('plugins.videos.video.add');
								}

								try {

									/*if (!data || !data.video || !data.video.name || !data.video.url) {
										socket.emit('plugins.videos.error', 'Des données sont manquantes.');
									}
									else {

										let bCategoryFound = false, stVideo = false;

											that.categories.forEach(function(category, key) {

												if (category.code === data.category.code) {

													bCategoryFound = true;

													stVideo = _formateVideo(data.video);

													category.videos.forEach(function(video, vidkey) {

														if (video.code === stVideo.code) {
															stVideo = false;
														}

													});

													if (stVideo) {
														that.categories[key].videos.push(stVideo);
													}

												}

											});

										if (!bCategoryFound) {
											socket.emit('plugins.videos.error', 'Impossible de trouver cette catégorie.');
										}
										else if (!stVideo) {
											socket.emit('plugins.videos.error', 'Cette vidéo est déjà enregistrée.');
										}
										else {
											
											that.saveData().then(function() {
												Container.get('websockets').emit('plugins.videos.video.added', stVideo);
											})
											.catch(function(err) {
												Container.get('logs').err('-- [plugins/VideosManager] - plugins.videos.video.add : ' + err);
												socket.emit('plugins.videos.error', err);
											});

										}
										
									}*/

								}
								catch (e) {
									Container.get('logs').err('-- [plugins/VideosManager/videos/add] : ' + ((e.message) ? e.message : e));
									Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
								}

							})
							.on('plugins.videos.video.edit', function (data) {

								if (Container.get('conf').get('debug')) {
									Container.get('logs').log('plugins.videos.video.edit');
								}

								try {

									/*if (!data || !data.video || !data.video.name || !data.video.url || !data.video.code) {
										socket.emit('plugins.videos.error', 'Des données sont manquantes.');
									}
									else {
										
										let bCategoryFound = false, stVideo = false;

											that.categories.forEach(function(category, catkey) {

												if (category.code === data.category.code) {

													bCategoryFound = true;

													category.videos.forEach(function(video, vidkey) {

														if (video.code === data.video.code) {
															stVideo = _formateVideo(data.video);
															that.categories[catkey].videos[vidkey] = stVideo;
														}

													});

												}

											});

										if (!bCategoryFound) {
											socket.emit('plugins.videos.error', 'Impossible de trouver cette catégorie.');
										}
										else if (!stVideo) {
											socket.emit('plugins.videos.error', 'Impossible de trouver cette vidéo.');
										}
										else {

											that.saveData().then(function() {
												Container.get('websockets').emit('plugins.videos.video.edited', stVideo);
											})
											.catch(function(err) {
												Container.get('logs').err('-- [plugins/VideosManager] - plugins.videos.video.edit : ' + err);
												socket.emit('plugins.videos.error', err);
											});

										}

									}*/

								}
								catch (e) {
									Container.get('logs').err('-- [plugins/VideosManager/videos/edit] : ' + ((e.message) ? e.message : e));
									Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
								}

							})
							.on('plugins.videos.video.delete', function (data) {

								if (Container.get('conf').get('debug')) {
									Container.get('logs').log('plugins.videos.video.delete');
								}

								let bCategoryFound = false, bVideoFound = false;

								try {

									/*that.categories.forEach(function(category, catkey) {

										if (category.code === data.category.code) {

											bCategoryFound = true;

											category.videos.forEach(function(video, vidkey) {

												if (video.code === data.video.code) {
													bVideoFound = true;
													that.categories[catkey].videos.splice(vidkey, 1);
												}

											});

										}

									});

									if (!bCategoryFound) {
										socket.emit('plugins.videos.error', 'Impossible de trouver cette catégorie.');
									}
									else if (!bVideoFound) {
										socket.emit('plugins.videos.error', 'Impossible de trouver cette vidéo.');
									}
									else {

										that.saveData().then(function() {
											that.loadVideosByCategory(Container, data.category);
										})
										.catch(function(err) {
											Container.get('logs').err('-- [plugins/VideosManager] - plugins.videos.video.delete : ' + err);
											socket.emit('plugins.videos.error', err);
										});

									}*/

								}
								catch (e) {
									Container.get('logs').err('-- [plugins/VideosManager/videos/delete] : ' + ((e.message) ? e.message : e));
									Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
								}

							});

							// action

								socket.on('plugins.videos.video.playsound', function (data) {

									if (Container.get('conf').get('debug')) {
										Container.get('logs').log('plugins.videos.video.playsound');
									}

									try {

										if (!data) {
											Container.get('logs').err('play video - données manquantes');
											socket.emit('plugins.videos.error', 'Données manquantes');
										}
										else if (!data.child) {
											Container.get('logs').err('play video - aucun enfant choisi');
											socket.emit('plugins.videos.error', 'Aucun enfant choisi');
										}
										else if (!data.video) {
											Container.get('logs').err('play video - aucune vidéo choisie');
											socket.emit('plugins.videos.error', 'Aucune vidéo choisie');
										}
										else {
											Container.get('childssockets').emitTo(data.child.token, 'media.sound.play', data.video);
										}

									}
									catch (e) {
										Container.get('logs').err('-- [plugins/VideosManager/videos/playsound] : ' + ((e.message) ? e.message : e));
										Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
									}

								});

								socket.on('plugins.videos.video.playvideo', function (data) {

									if (Container.get('conf').get('debug')) {
										Container.get('logs').log('plugins.videos.video.playvideo');
									}

									try {

										if (!data) {
											Container.get('logs').err('play video - données manquantes');
											socket.emit('plugins.videos.error', 'Données manquantes');
										}
										else if (!data.child) {
											Container.get('logs').err('play video - aucun enfant choisi');
											socket.emit('plugins.videos.error', 'Aucun enfant choisi');
										}
										else if (!data.video) {
											Container.get('logs').err('play video - aucune vidéo choisie');
											socket.emit('plugins.videos.error', 'Aucune vidéo choisie');
										}
										else {
											Container.get('childssockets').emitTo(data.child.token, 'media.video.play', data.video);
										}

									}
									catch (e) {
										Container.get('logs').err('-- [plugins/VideosManager/videos/playvideo] : ' + ((e.message) ? e.message : e));
										Container.get('websockets').emit('plugins.videos.error', ((e.message) ? e.message : e));
									}

								});

					});

					resolve();
				
				}).catch(reject);

			}
			catch(e) {
				reject((e.message) ? e.message : e);
			}

		});

	}

	unload (Container) {

		super.unload();

		let that = this;

		return new Promise(function(resolve, reject) {

			try {

				that.categories = null;
				that.videos = null;

				Container.get('websockets').getSockets().forEach(_freeSocket);

				resolve();

			}
			catch(e) {
				reject((e.message) ? e.message : e);
			}
		
		});

	}

	install (Container) {
		return _runSQLFile(Container, path.join(__dirname, 'database', 'create.sql'));
	}

	update (Container) {

		return fs.unlinkProm(path.join(__dirname, 'backup.json')).then(function() {
			return this.install(Container);
		});

	}

	uninstall () {
		
		return fs.unlinkProm(path.join(__dirname, 'backup.json')).then(function() {
			return _runSQLFile(Container, path.join(__dirname, 'database', 'delete.sql'));
		});

	}

};
