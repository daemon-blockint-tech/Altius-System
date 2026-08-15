---
source_url: https://www.palantir.com/docs/foundry/api-reference/transforms-python-library/api-dataset
---

Search

[Palantir](</docs/>)[API Reference](</docs/foundry/api-reference/>)

Search documentation

Search

karat

+

K

[User Documentation ↗](</docs/foundry/>)Send feedback

ABXY

ABXYABXYABXYABXYABXYABXY

  * [Index](</docs/foundry/api-reference/>)
  * Libraries

    * [Transforms](</docs/foundry/api-reference/transforms-python-library/api-overview/>)
  * [REST API](</docs/foundry/api/v2/>)



## Transforms

Hide sidebar

  * Python

  * transforms-python

    * transforms.api

      * [Overview](</docs/foundry/api-reference/transforms-python-library/api-overview/>)
      * [BooleanParam](</docs/foundry/api-reference/transforms-python-library/api-booleanparam/>)
      * [Check](</docs/foundry/api-reference/transforms-python-library/api-check/>)
      * [ComputeBackend](</docs/foundry/api-reference/transforms-python-library/api-computebackend/>)
      * [configure](</docs/foundry/api-reference/transforms-python-library/api-configure/>)
      * [ContainerTransform](</docs/foundry/api-reference/transforms-python-library/api-containertransform/>)
      * [ContainerTransformsConfiguration](</docs/foundry/api-reference/transforms-python-library/api-containertransformsconfiguration/>)
      * [Dataset](</docs/foundry/api-reference/transforms-python-library/api-dataset/>)
      * [FileStatus](</docs/foundry/api-reference/transforms-python-library/api-filestatus/>)
      * [FileSystem](</docs/foundry/api-reference/transforms-python-library/api-filesystem/>)
      * [FloatParam](</docs/foundry/api-reference/transforms-python-library/api-floatparam/>)
      * [FoundryDataSidecarFile](</docs/foundry/api-reference/transforms-python-library/api-foundrydatasidecarfile/>)
      * [FoundryDataSidecarFileSystem](</docs/foundry/api-reference/transforms-python-library/api-foundrydatasidecarfilesystem/>)
      * [FoundryInputParam](</docs/foundry/api-reference/transforms-python-library/api-foundryinputparam/>)
      * [FoundryOutputParam](</docs/foundry/api-reference/transforms-python-library/api-foundryoutputparam/>)
      * [incremental](</docs/foundry/api-reference/transforms-python-library/api-incremental/>)
      * [IncrementalLightweightInput](</docs/foundry/api-reference/transforms-python-library/api-incrementallightweightinput/>)
      * [IncrementalLightweightOutput](</docs/foundry/api-reference/transforms-python-library/api-incrementallightweightoutput/>)
      * [IncrementalTableTransformInput](</docs/foundry/api-reference/transforms-python-library/api-incrementaltabletransforminput/>)
      * [IncrementalTransformContext](</docs/foundry/api-reference/transforms-python-library/api-incrementaltransformcontext/>)
      * [IncrementalTransformInput](</docs/foundry/api-reference/transforms-python-library/api-incrementaltransforminput/>)
      * [IncrementalTransformOutput](</docs/foundry/api-reference/transforms-python-library/api-incrementaltransformoutput/>)
      * [Input](</docs/foundry/api-reference/transforms-python-library/api-input/>)
      * [InputSet](</docs/foundry/api-reference/transforms-python-library/api-inputset/>)
      * [IntegerParam](</docs/foundry/api-reference/transforms-python-library/api-integerparam/>)
      * [lightweight](</docs/foundry/api-reference/transforms-python-library/api-lightweight/>)
      * [LightweightContext](</docs/foundry/api-reference/transforms-python-library/api-lightweightcontext/>)
      * [LightweightException](</docs/foundry/api-reference/transforms-python-library/api-lightweightexception/>)
      * [LightweightInput](</docs/foundry/api-reference/transforms-python-library/api-lightweightinput/>)
      * [LightweightInputParam](</docs/foundry/api-reference/transforms-python-library/api-lightweightinputparam/>)
      * [LightweightNotImplementedError](</docs/foundry/api-reference/transforms-python-library/api-lightweightnotimplementederror/>)
      * [LightweightOutput](</docs/foundry/api-reference/transforms-python-library/api-lightweightoutput/>)
      * [LightweightOutputParam](</docs/foundry/api-reference/transforms-python-library/api-lightweightoutputparam/>)
      * [LightweightTypeError](</docs/foundry/api-reference/transforms-python-library/api-lightweighttypeerror/>)
      * [LightweightValueError](</docs/foundry/api-reference/transforms-python-library/api-lightweightvalueerror/>)
      * [Markings](</docs/foundry/api-reference/transforms-python-library/api-markings/>)
      * [OrgMarkings](</docs/foundry/api-reference/transforms-python-library/api-orgmarkings/>)
      * [Output](</docs/foundry/api-reference/transforms-python-library/api-output/>)
      * [OutputSet](</docs/foundry/api-reference/transforms-python-library/api-outputset/>)
      * [Param](</docs/foundry/api-reference/transforms-python-library/api-param/>)
      * [ParamContext](</docs/foundry/api-reference/transforms-python-library/api-paramcontext/>)
      * [ParamValueInput](</docs/foundry/api-reference/transforms-python-library/api-paramvalueinput/>)
      * [Pipeline](</docs/foundry/api-reference/transforms-python-library/api-pipeline/>)
      * [StringParam](</docs/foundry/api-reference/transforms-python-library/api-stringparam/>)
      * [TableTransformInput](</docs/foundry/api-reference/transforms-python-library/api-tabletransforminput/>)
      * [transform_df](</docs/foundry/api-reference/transforms-python-library/api-transform-df/>)
      * [transform_pandas](</docs/foundry/api-reference/transforms-python-library/api-transform-pandas/>)
      * [transform_polars](</docs/foundry/api-reference/transforms-python-library/api-transform-polars/>)
      * [transform](</docs/foundry/api-reference/transforms-python-library/api-transform/>)
      * [TransformContext](</docs/foundry/api-reference/transforms-python-library/api-transformcontext/>)
      * [TransformInput](</docs/foundry/api-reference/transforms-python-library/api-transforminput/>)
      * [TransformOutput](</docs/foundry/api-reference/transforms-python-library/api-transformoutput/>)



[Transforms](</docs/foundry/api-reference/transforms-python-library/api-overview/>)transforms-python[transforms.api](</docs/foundry/api-reference/transforms-python-library/api-overview/>)[Dataset](</docs/foundry/api-reference/transforms-python-library/api-dataset/>)

# [](<#foundrytransformsdataset>)foundry.transforms.Dataset

## [](<#foundry.transforms.Dataset>)_class_ foundry.transforms.Dataset(alias)

A class representing the files backing a Foundry dataset view.

Prefer using the static [`Dataset.get()`](<#foundry.transforms.Dataset.get>) factory method instead of calling the constructor directly.

### [](<#foundry.transforms.Dataset.get>)_static method_ get(alias)

Create a new `Dataset` instance for the given alias.

  * **Parameters:** **alias** ([_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>)) – The alias of the dataset.
  * **Returns:** A new `Dataset` instance.
  * **Return type:** [`Dataset`](<#foundry.transforms.Dataset>)



### [](<#foundry.transforms.Dataset.alias>)_property_ alias

The alias of the dataset.

  * **Type:** [str ↗](<https://docs.python.org/3/library/stdtypes.html#str>)



### [](<#foundry.transforms.Dataset.schema>)_property_ schema

The Foundry field schema of the dataset.

  * **Type:** `FoundryFieldSchema`



### [](<#foundry.transforms.Dataset.write_table_path>)_property_ write_table_path

The path on disk for the dataset files to be used with `write_table`.

  * **Type:** [str ↗](<https://docs.python.org/3/library/stdtypes.html#str>)



### [](<#foundry.transforms.Dataset.lazy_write_table_path>)_property_ lazy_write_table_path

An object store path to a bucket that will be mapped into the output transaction.

  * **Type:** [str ↗](<https://docs.python.org/3/library/stdtypes.html#str>)



### [](<#foundry.transforms.Dataset.read_table>)read_table(columns=None, row_limit=None, format='dataframe', mode='current', force_dataset_download=False, schema=None)

Read a tabular Foundry dataset as a pandas DataFrame, Polars DataFrame, Arrow Table, or raw file path.

  * **Parameters:**
    * **columns** (_List_ _[_[_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _]_ _,_ _optional_) – The subset of columns to read.
    * **row_limit** ([_int_ ↗](<https://docs.python.org/3/library/functions.html#int>) _,_ _optional_) – The maximum number of rows to read.
    * **format** ([_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _,_ _optional_) – The output type. One of `"arrow"`, `"pandas"`, `"dataframe"` (alias for pandas, default), `"polars"`, `"lazy-polars"`, or `"path"`. When set to `"path"`, a path pointing to the raw dataset files is returned.
    * **mode** ([_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _,_ _optional_) – The read mode, one of `"current"`, `"previous"`, or `"added"`. Defaults to `"current"`.
    * **force_dataset_download** ([_bool_ ↗](<https://docs.python.org/3/library/functions.html#bool>) _,_ _optional_) – Whether the dataset must be re-downloaded even if present in local content. Defaults to `False`.
    * **schema** (_FoundryFieldSchema_ _,_ _optional_) – The schema to apply if reading an empty incremental output.
  * **Returns:** The dataset contents in the requested format.
  * **Return type:** [`pyarrow.Table` ↗](<https://arrow.apache.org/docs/python/generated/pyarrow.Table.html>) | [`pandas.DataFrame` ↗](<https://pandas.pydata.org/pandas-docs/stable/reference/api/pandas.DataFrame.html#pandas.DataFrame>) | [`polars.DataFrame` ↗](<https://docs.pola.rs/api/python/stable/reference/dataframe/index.html>) | [`polars.LazyFrame` ↗](<https://docs.pola.rs/api/python/stable/reference/lazyframe/index.html>) | [str ↗](<https://docs.python.org/3/library/stdtypes.html#str>)



When `columns`, `row_limit`, or filters applied via the `where()` method are set, the output `format` must be one of `"arrow"`, `"dataframe"`, `"pandas"`, or `"polars"`, and `mode` must be `"current"`.

### [](<#foundry.transforms.Dataset.write_table>)write_table(df, column_descriptions=None)

Upload tabular data to a Foundry dataset. This uploads the data, infers a schema, and updates column description metadata.

Accepts a pandas DataFrame, Arrow Table, Polars DataFrame, DuckDB PyRelation, or a path (string or `pathlib.Path`) pointing to a raw dataset.

  * **Parameters:**
    * **df** – The data to upload. Accepts [`pandas.DataFrame` ↗](<https://pandas.pydata.org/pandas-docs/stable/reference/api/pandas.DataFrame.html#pandas.DataFrame>), [`pyarrow.Table` ↗](<https://arrow.apache.org/docs/python/generated/pyarrow.Table.html>), [`polars.DataFrame` ↗](<https://docs.pola.rs/api/python/stable/reference/dataframe/index.html>), DuckDB `PyRelation`, or a path matching `write_table_path`.
    * **column_descriptions** (_Dict_ _[_[_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _,_ [_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _]_ _,_ _optional_) – Map of column names to their string descriptions. This map is intersected with the columns of the DataFrame, and must include descriptions no longer than 800 characters.
  * **Returns:** None



### [](<#foundry.transforms.Dataset.put_metadata>)put_metadata(column_descriptions=None)

Finalize a dataset after uploading raw Parquet files. This infers a Foundry schema from the uploaded Parquet and updates column description metadata on the dataset.

You must call this method after one or more Parquet files have been uploaded to the output dataset so that a schema can be inferred. The method will throw if it is called before a successful file upload.

  * **Parameters:** **column_descriptions** (_Dict_ _[_[_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _,_ [_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _]_ _,_ _optional_) – Map of column names to their string descriptions. This map is intersected with the columns of the dataset, and must include descriptions no longer than 800 characters.
  * **Returns:** None



### [](<#foundry.transforms.Dataset.set_write_mode>)set_write_mode(mode)

Set the write mode of the dataset.

  * **Parameters:** **mode** ([_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>)) – The write mode, one of `"replace"`, `"modify"`, or `"append"`. In modify mode, anything written is appended to the dataset and may also override existing files. In append mode, anything written is appended to the dataset and will not override existing files. In replace mode, anything written replaces the dataset.
  * **Returns:** None



The write mode cannot be changed after data has been written.

### [](<#foundry.transforms.Dataset.files>)files(mode='current', show_hidden_files=False)

List files in a Foundry dataset.

  * **Parameters:**
    * **mode** ([_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _,_ _optional_) – The read mode, one of `"current"`, `"previous"`, or `"added"`. Defaults to `"current"`.
    * **show_hidden_files** ([_bool_ ↗](<https://docs.python.org/3/library/functions.html#bool>) _,_ _optional_) – Whether to list hidden files. Defaults to `False`.
  * **Returns:** The collection of files in the dataset.
  * **Return type:** `FileCollection`



### [](<#foundry.transforms.Dataset.upload_file>)upload_file(path, logical_path=None)

Upload a local file to a Foundry dataset.

  * **Parameters:**
    * **path** ([_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>)) – The path to the local file to upload.
    * **logical_path** ([_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _,_ _optional_) – The destination path in the Foundry dataset. If not provided, the file is uploaded to the root with the same name as the local file.
  * **Returns:** The name of the uploaded Foundry dataset file.
  * **Return type:** [str ↗](<https://docs.python.org/3/library/stdtypes.html#str>)



### [](<#foundry.transforms.Dataset.upload_directory>)upload_directory(local_dir_path)

Upload a local directory to a Foundry dataset. All files found recursively inside the directory will be uploaded.

  * **Parameters:** **local_dir_path** ([_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>)) – The path to the local directory to upload.
  * **Returns:** A map of local file paths to the corresponding Foundry dataset file paths.
  * **Return type:** _Dict_ _[_[_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _,_ [_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>) _]_



### [](<#foundry.transforms.Dataset.where>)where(operand_filter)

Apply a row filter to the dataset. Returns the dataset so that calls can be chained. Filters are applied when `read_table` is called.

  * **Parameters:** **operand_filter** – A filter expression built using `Column.get()`.
  * **Returns:** The filtered dataset.
  * **Return type:** [`Dataset`](<#foundry.transforms.Dataset>)



Supported operators on `Column`:

  * `==`, `!=`, `>`, `>=`, `<`, `<=`
  * `.isnull()`
  * `.isin(values)`
  * `.between(lower, upper)`



Combine filters with `&` (and), `|` (or), and `~` (not).
    
    
    Copied!
    
    1
    2
    3
    4
    5
    6
    from foundry.transforms import Dataset
    from foundry.transforms import Column
    
    ds = Dataset.get("my_dataset")
    filtered = ds.where(Column.get("age") > 18)
    result = filtered.read_table(format="pandas")

### [](<#foundry.transforms.Dataset.select>)select(*column_names)

Select a subset of columns from the dataset. Returns the dataset so that calls can be chained.

  * **Parameters:** **column_names** ([_str_ ↗](<https://docs.python.org/3/library/stdtypes.html#str>)) – The names of the columns to select.
  * **Returns:** The dataset with the column selection applied.
  * **Return type:** [`Dataset`](<#foundry.transforms.Dataset>)



### [](<#foundry.transforms.Dataset.limit>)limit(row_limit)

Set the maximum number of rows to read. Returns the dataset so that calls can be chained.

  * **Parameters:** **row_limit** ([_int_ ↗](<https://docs.python.org/3/library/functions.html#int>)) – The maximum number of rows.
  * **Returns:** The dataset with the row limit applied.
  * **Return type:** [`Dataset`](<#foundry.transforms.Dataset>)



### [](<#foundry.transforms.Dataset.abort>)abort()

Abort all work on this dataset. Any data written before or after calling this method will be ignored.

  * **Returns:** The aborted dataset.
  * **Return type:** [`Dataset`](<#foundry.transforms.Dataset>)



[←PREVIOUSContainerTransformsConfiguration](</docs/foundry/api-reference/transforms-python-library/api-containertransformsconfiguration/>)

[NEXTFileStatus→](</docs/foundry/api-reference/transforms-python-library/api-filestatus/>)

© 2026 Palantir Technologies Inc. All rights reserved.

[Cookies Statement ↗](<https://www.palantir.com/cookie-statement/>)[Privacy Statement ↗](<https://www.palantir.com/privacy-and-security/>)[Terms of Use ↗](<https://www.palantir.com/terms-and-conditions/>)

Cookie Settings
