exports.mod = (mod_info) => {

	let config = require("../config.json");

	let existingShoppinglistIndex = -1;
	let areaRequiredItemsMap = new Map();
	let itemsInStashMap = new Map();
	let hareas = fileIO.readParsed(global.db.user.cache.hideout_areas);
	let locale = fileIO.readParsed(global.db.user.cache.locale_en);
	let hideoutShoppingListString = "";
	let foundOrphan = false;

	let HideoutAreaTypeToNameMap = new Map()
	HideoutAreaTypeToNameMap.set(0, "Vents");
	HideoutAreaTypeToNameMap.set(1, "Security");
	HideoutAreaTypeToNameMap.set(2, "Lavatory");
	HideoutAreaTypeToNameMap.set(3, "Stash");
	HideoutAreaTypeToNameMap.set(4, "Generator");
	HideoutAreaTypeToNameMap.set(5, "Heating");
	HideoutAreaTypeToNameMap.set(6, "Water Collector");
	HideoutAreaTypeToNameMap.set(7, "Medstation");
	HideoutAreaTypeToNameMap.set(8, "Nutrition Unit");
	HideoutAreaTypeToNameMap.set(9, "Rest Space");
	HideoutAreaTypeToNameMap.set(10, "Workbench");
	HideoutAreaTypeToNameMap.set(11, "Intelligence Center");
	HideoutAreaTypeToNameMap.set(12, "Shooting Range");
	HideoutAreaTypeToNameMap.set(13, "Library");
	HideoutAreaTypeToNameMap.set(14, "Scav Case");
	HideoutAreaTypeToNameMap.set(15, "Illumination");
	HideoutAreaTypeToNameMap.set(16, "Disabled??? What is this???");
	HideoutAreaTypeToNameMap.set(17, "Air Filtering Unit");
	HideoutAreaTypeToNameMap.set(18, "Solar Panel");
	HideoutAreaTypeToNameMap.set(19, "Booze Generator");
	HideoutAreaTypeToNameMap.set(20, "Bitcoin Farm");
	HideoutAreaTypeToNameMap.set(21, "Christmas Tree");

	let checkShoppingList = (sessionID) => {
		let pmcData = profile_f.handler.getPmcProfile(sessionID);

		//check to see if a player's notes json array contains a shopping list already
		updateExistingShoppingListIndex(pmcData);

		//read the required items out of every hideout area that has an available upgrade
		populateItemsRequiredAmount(pmcData);

		//search the stash for each of the items that are required and store the how many exists
		populateItemsRequiredInStash(pmcData);

		//build the hideout shopping list string
		buildHideoutShoppingListString();

		//add or edit the shopping list note in the player profile depending if one exists already
		saveHideoutShoppingListStringToPmcProfile(pmcData);
	}

	let updateExistingShoppingListIndex = (pmcData) => {

		for (let i in pmcData.Notes.Notes) {
			let currentNote = pmcData.Notes.Notes[i];

			if (currentNote == null) {
				continue;
			}

			if (typeof currentNote.Text === 'string' || currentNote.Text instanceof String) {
				if (currentNote.Text.indexOf("Hideout Upgrade Shopping List:") === 0) {
					existingShoppinglistIndex = i;
					break;
				}
			}
		}
	}

	let populateItemsRequiredAmount = (pmcData) => {

		for (let areaPmcData of pmcData.Hideout.Areas) {

			//If its at starting level just skip it, the player is probably not trying to work on upgrading it from 0 yet?
			if (areaPmcData.Level == 0) {
				continue;
			}

			//If the areaPmcData.type is not enabled in the config.json file then continue
			let isHideoutAreaEnabled = false;
			let nameOfHideoutArea = HideoutAreaTypeToNameMap.get(areaPmcData.type);
			for (const hideoutAreaNameKey of Object.keys(config.CheckHideoutAreasEnabled)) {
				if (hideoutAreaNameKey == nameOfHideoutArea) {
					isHideoutAreaEnabled = config.CheckHideoutAreasEnabled[hideoutAreaNameKey];
					break;
				}
			}
			if (!isHideoutAreaEnabled) {
				continue;
			}

			// get the first hideout area that matches the hideout area type
			var areaDBCache = hareas.data.find(obj => {
				return obj.type === areaPmcData.type
			});

			if (areaDBCache == null) {
				continue;
			}

			let tmpItemAndAmountRequirement = new Map();

			let nextStage = areaDBCache.stages[(areaPmcData.level + 1).toString()];

			if (nextStage == null) {
				continue;
			}

			for (let requirement of nextStage.requirements) {
				if (requirement.type == "Item") {

					let myTemplateId = requirement.templateId;
					let myCount = requirement.count;

					tmpItemAndAmountRequirement.set(myTemplateId, myCount);

				} else {
					//if the requirement is not an item requirement skip it :D
					continue;
				}
			}

			if (tmpItemAndAmountRequirement.size > 0) {
				let currentAreaType = areaPmcData.type;

				areaRequiredItemsMap.set(currentAreaType, tmpItemAndAmountRequirement);
			}
		}
	}

	let populateItemsRequiredInStash = (pmcData) => {

		for (const tmpItem of pmcData.Inventory.items) {
			
			// Ignore orphan items
			if(isOrphan(pmcData.Inventory.items, tmpItem)){
				foundOrphan = true;
			
				continue;
			}
			
			let foundTemplateInReqs = false;

			for (const [areaTypeKey, mapOfItemsValue] of areaRequiredItemsMap) {

				for (const [itemIDKey, itemRequiredAmountValue] of mapOfItemsValue) {
					let tmpItemAmountTotal = 0;

					if (itemsInStashMap.has(itemIDKey)) {
						tmpItemAmountTotal = itemsInStashMap.get(itemIDKey);
					}

					if (tmpItem._tpl == itemIDKey) {

						if (typeof (tmpItem.upd) == 'undefined' || tmpItem.upd == null || typeof (tmpItem.upd.StackObjectsCount) == 'undefined' || tmpItem.upd.StackObjectsCount == null) {
							tmpItemAmountTotal = tmpItemAmountTotal + 1;
						} else {
							tmpItemAmountTotal = tmpItemAmountTotal + tmpItem.upd.StackObjectsCount;
						}
						
						foundTemplateInReqs = true;
					}

					itemsInStashMap.set(itemIDKey, tmpItemAmountTotal);
					
					if(foundTemplateInReqs){
						break;
					}
				}
					
				if(foundTemplateInReqs){
					break;
				}
			}
		}
	
		// Warn that an orphan has been found is necessary
		if(foundOrphan){
			console.log("[Mod] HideoutShoppingList: Found orphan item in inventory! Consider cleaning your character.json");
		}
	}

	let buildHideoutShoppingListString = () => {

		var stringArray = [];
		stringArray.push("Hideout Upgrade Shopping List:" + "\n");
		stringArray.push("\n");
		for (const [areaTypeKey, mapOfItemsValue] of areaRequiredItemsMap) {

			stringArray.push(HideoutAreaTypeToNameMap.get(areaTypeKey) + ":" + "\n");

			for (const [itemIDKey, itemRequiredAmountValue] of mapOfItemsValue) {

				let tmpStr = "";
				let tmpHaveAmount = 0;

				if (itemsInStashMap.has(itemIDKey)) {
					tmpHaveAmount = itemsInStashMap.get(itemIDKey);
				}

				let tmpRequiredAmount = itemRequiredAmountValue;
				let nameOfItem = locale.templates[itemIDKey].Name;

				let isGreaterOrEqual = tmpHaveAmount >= tmpRequiredAmount;

				if (isGreaterOrEqual) {
					tmpStr = tmpStr + "[X] ";
				} else {
					tmpStr = tmpStr + "[ ] ";
				}

				tmpStr = tmpStr + numberWithCommas(tmpHaveAmount) + "/" + numberWithCommas(tmpRequiredAmount) + " " + nameOfItem;

				stringArray.push(tmpStr + "\n");
			}
		}

		hideoutShoppingListString = stringArray.join("");
	}

	let saveHideoutShoppingListStringToPmcProfile = (pmcData, sessionID) => {
		if (existingShoppinglistIndex == -1) {
			pmcData.Notes.Notes.push({
				"Time": Math.floor(new Date().getTime() / 1000),
				"Text": hideoutShoppingListString
			});
		} else {

			pmcData.Notes.Notes[existingShoppinglistIndex] = {
				"Time": Math.floor(new Date().getTime() / 1000),
				"Text": hideoutShoppingListString
			};
		}
	}

	let numberWithCommas = (x) => {
		return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}

	let isOrphan = (items, item) => {
		for(const otherItem of items){
			if(otherItem._id == item.parentId){
				return false;
			}
		}
		return true;
	}

	let exec = (url, info, sessionID) => {
		try {
			checkShoppingList(sessionID);
		} catch (error) {
			console.log("[Mod] HideoutShoppingList has encountered an error:")
			console.log(error.toString());
		}

		offraid_f.saveProgress(info, sessionID);
		return response_f.nullResponse();
	}

	global.router.staticRoutes["/raid/profile/save"] = exec.bind(this)

	logger.logSuccess("[Mod] HideoutShoppingList Successfully Applied");
}