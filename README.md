This is generated by GPT as a starting place. as of 7.7.24 112a, it is untested to see if its working at all. 

Features to be added


- Login via Character Name and Pass
- Gold Entry, this should be on the same page as loot entry for simplicity.
- - Need inputs for: Session Date(default today), type(string, list), notes(string), Copper(int), Silver(int), Gold(int), Plat(int)
- Loot Entry
- - Need inputs for: Session Date(Default Today), Quanity(int), Item Name(string), Unidentified(bool), Type(string, list), Size(string, list)
- - Item Name should auto fill based on database of items, but allow custom input as well
- Main Loot View
- - Columns in view: Quanity, Item Name, Unidentified, type, size, believed value(this will be the character that is logged in), value if sold, who has it, average appraisal
- - Be able to select items with buttons for Keep Self, Keep Party, Sell, Trash/Give Away, Identify
- - Items show a condensed view, so if 10 arrows are found in session 1, and 20 in session 2, the view shows 30 arrows. Hovering over the items should show details of # found and session date if there are multiple entries
- Kept Loot View
- - Columns in view: Quanity, Item Name, type, size, believed value(this will be the character that is logged in, who has it, average appraisal
- - A table that shows how much each character has 'taken' from party loot
- Party Kept Loot
- - Columns in view: Quanity, Item Name, type, size, believed value(this will be the character that is logged in, who has it, average appraisal
- - Allow updates of quanity, or change to kept instead of party kept
- - Use one button for when potions or scrolls are used
- Sold View
- - Record of what was sold on what day
- Given away/Trash View
- - Record of what was given away/trashed
- Gold View
- - Show transactions in the last 6 realtime months 
- - Show total party gold available
- - Have a quick way to distribute gold to players with option to leave gold in party loot
- Automatically calculate appraisal amounts for each character at time of input 


Other features that are less important
- Session tracking, who showed on what day
- Wealth by level check(Less important, I think Herolab does it)
- Spell book page



Plan is to have it dockerized, so we don't need to include features to seperate different campaigns, as each one will have its own container

