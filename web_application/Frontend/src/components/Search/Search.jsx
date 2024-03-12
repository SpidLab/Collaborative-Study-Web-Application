import './Search.css';

function SearchPage() {
    return (
        <div className="search-container">
            <div className="left-column">
            <label className='sec_title'>Initiator Search</label>
                <div className="search-block">
                    <label>Phenotype(s)</label>
                    <input type="text"/>
                    <label>Minimum # of Samples</label>
                    <input type="text"/>
                    <button>Search For Collabrator</button>
                </div>
            </div>
            <div className="right-column">
                <p>Search Results</p>
            </div>
        </div>
    );
}

export default SearchPage;
