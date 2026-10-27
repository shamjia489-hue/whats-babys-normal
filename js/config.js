// ---------------------------------------------------------------
// SWAPPING IN THE REAL DATA
// 1. Export the transcription spreadsheet as CSV with these columns:
//      day,time,type,duration_min,amount,unit,colour,text,flag
//    (one row per event; see the data dictionary on the "How this was built" tab)
// 2. Save it as data/events.csv (replacing the sample file).
// 3. Set IS_SAMPLE to false below. The "Sample data" labels disappear.
// ---------------------------------------------------------------

export const DATA_URL = "data/events.csv";
export const IS_SAMPLE = true;

export const TOTAL_DAYS = 49;
export const GESTATION_WEEKS = 37;

// Which day's notebook page is shown in "From notebook to data".
export const NOTEBOOK_DAY = 12;
export const NOTEBOOK_IMAGE = "assets/notebook-page-placeholder.svg";
