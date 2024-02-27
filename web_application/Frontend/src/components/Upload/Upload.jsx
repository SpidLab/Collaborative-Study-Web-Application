import React, { useState } from 'react';
import "./Upload.css";

function UploadForm() {
    const [field1, setField1] = useState('');
    const [field2, setField2] = useState('');
    const [field3, setField3] = useState('');

    const handleField1Change = (event) => {
        setField1(event.target.value);
    };

    const handleField2Change = (event) => {
        setField2(event.target.value);
    };

    const handleField3Change = (event) => {
        setField3(event.target.value);
    };

    const handleSubmit = (event) => {
        event.preventDefault();

        console.log('Field 1:', field1);
        console.log('Field 2:', field2);
        console.log('Field 3:', field3);
    };

    return (
        <div className="body">
        <form className="upload-form" onSubmit={handleSubmit}>
            <label className='sec_title'>Dataset Metadata Upload</label>
            <label htmlFor="field1">Phenotype(s):</label>
            <input type="text" id="field1" name="field1" value={field1} onChange={handleField1Change} /><br /><br />

            <label htmlFor="field2"># of Samples:</label>
            <input type="text" id="field2" name="field2" value={field2} onChange={handleField2Change} /><br /><br />

            <label htmlFor="field3">List of SPNs:</label>
            <input type="text" id="field3" name="field3" value={field3} onChange={handleField3Change} /><br /><br />

            <button type="submit">Upload Dataset</button>
        </form>
        </div>
    );
}

export default UploadForm;
