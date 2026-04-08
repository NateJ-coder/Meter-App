Attribute VB_Name = "D_Breakdown_Data_Load"
' READ DATA GENERATE BREAKDOWNS %%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
Dim ElecComPFix As Double
Dim WaterComPFix As Double

Function Load_Building_Data() As Boolean
    
  '  Debug.Print " Load_Building_Data ---------" & Timer - StartTime

    ' This routine loads all the data from the selected BUILDING/MONTH into memory from fast calculation speed
    ClearData '  Reset variables
    GetSharingOptions ' For each line item - Fixed, Even, PQ, None >> Elc Com Prop, Service Charges, Water Surcharge...
    
    'On Error GoTo SkipOut          ' Error trapping is currently disables while developement is in progress

 '   SheetName = ActiveSheet.Name                ' Get Current Sheet Name     i.e. AZ
    Sheets(SheetName).Activate                  ' Activate the sheet
    BuildingName = Range("A1")                  ' Get Building Name          i.e. THE AZORES
   ' SelectedUnitName = Cells(ActiveCell.Row, 1) ' Get the UNIT number/Name   i.e. AZ01
    
    DateRow = 2                                 ' Set Date Row
    SelCol = ActiveCell.Column                  ' Get the selected Column Number
    SelMonth = Cells(1, SelCol)                 ' Get the ALLOCATED MONTH connected to that Column Number
    SelDate = Cells(DateRow, SelCol)            ' Get Selected Date
    PrevDate = Cells(DateRow, SelCol - 1)
    
    IgnoreNegComP = Sheets("Settings").Range("B6")
     
    ' Get Vat Percentage   --------------------------------------------
    Dim GetVat As String
    GetVat = Sheets("Settings").Range("C4")
    VatPercent = CDbl(GetVat)
    
    ' Get Tarrif Charges   --------------------------------------------
    Dim TariffName As String
    ElecTarrifRow = 3:  TariffName = Cells(ElecTarrifRow, SelCol)   ' Get the NAME of the TARIFF TABLE that applies to the selected MONTH
 
    If LoadTarrifs(TariffName) = True Then ' Load the ELECTRICITY and WATER Tariff Tables
        LoadTarrifsNew (TariffName)
        Load_Building_Data = True
        
    End If
   ' LoadSanTariffs (TariffName)
    
    ' -----------------------------------------------------------------
    Sheets(SheetName).Activate ' IMPORTANT TO RE-SELECT THE CORRECT SHEET BEFORE LOADING ACTUAL READING DATA
    
    ' Here begins the process of reading each line and determining how each reading is allocated, to Electricity or Water, to Units, Bulk or Common property
    ' Search for "ELECTRICITY" to start
  
    Index = FindRow(1, "Electricity")
    ThisCell = "ELECTRICITY"
    
    Index = Index + 1       ' The START has been found, so now it goes to the next line to read the first "Real" data entry
    ThisUtility = ThisCell  '  ("ELECTRICITY") ' This is to remember with which Utility it is not dealing
    
    '  Here we ZERO all the COUNTS
    ElecUnitCount = 0:  ElecComCount = 0:   ElecBulkCount = 0
    WaterUnitCount = 0: WaterComCount = 0:  WaterBulkCount = 0
    
    '  Here we ZERO all the TOTALS
    ElecBulkTotCon = 0: WaterBulkTotCon = 0
    ElecComTotCon = 0: WaterComTotCon = 0
    ElecUnitTotCon = 0: WaterUnitTotCon = 0
    ExCount = 0
    
    ' Zero Prepaid Totals
    PPElecConvMeterTotal = 0
    PPWaterConvMeterTotal = 0

'  READS in all the data using the selected BUILDING and DATE ###################################

      Dim PrepaidCheck    As Variant
      
    While ThisCell <> ""                        ' Continue until a blank cell is reached to mark the end of the data
        If ThisCell = "WATER" Then             '
            ThisUtility = "WATER"               ' Check for change in Utility Allocation
            Index = Index + 1
        End If
            
            EntryName = UCase(Cells(Index, 1))          ' Gets the Name of the UNIT or wheather it is BULK or COMMON PROP
            
        ' ----------------------------------------------------------------
            ThisReading = CDbl(Cells(Index, SelCol))
            PrevReading = Cells(Index, SelCol - 1)
            
            PrepaidCheck = Cells(Index, 2)          ' Gets Prepaid
            Consumption = GetConsumption(ThisReading, PrevReading)
         
        '  ------ THIS IS TO CHECK FOR THE EXCEPTION "*" FOR HM to multiply reading by 160, which is what the Eskom account does.
            If PrepaidCheck > "" Then
                FindException = InStr(1, PrepaidCheck, "*")
                 If FindException > 0 Then
                    Factor = CDbl(Mid(PrepaidCheck, FindException + 1))
                    Consumption = Consumption * Factor
                 End If
            End If
            
            If Consumption < 0 Then Consumption = Consumption + 1000000 ' SUGGESTS THE METER HAS ROLLED OVER?
            
            Code = Mid(EntryName, 1, 3)     ' First 3 letters of EntryName
            If Code = "BUL" Then                        ' Detects that the entry is to be allocated as a BULK charge
                If ThisUtility = "ELECTRICITY" Then
                    ElecBulkCount = ElecBulkCount + 1
                    ElecBulkTotCon = ElecBulkTotCon + Consumption
                End If
                If ThisUtility = "WATER" Then
                    WaterBulkCount = WaterBulkCount + 1
                    WaterBulkTotCon = WaterBulkTotCon + Consumption
                End If
                
            Else
                If Code = "COM" Then    ' Detects that the entry is to be allocated as a BULK charge
                    If ThisUtility = "ELECTRICITY" Then
                        ElecComCount = ElecComCount + 1
                        ElecComTotCon = ElecComTotCon + Consumption
                    End If
                    If ThisUtility = "WATER" Then
                        WaterComCount = WaterComCount + 1
                        WaterComTotCon = WaterComTotCon + Consumption
                    End If
                Else
                             
                    ' Since neither BULK or COMMON are detected, the entry is allocated as a UNIT charge
                    If ThisUtility = "ELECTRICITY" Then
                          PQ = Cells(Index, 3)
        
                          ElecUnitCount = ElecUnitCount + 1
                          PercentageQuotes(ElecUnitCount) = CDbl(PQ)
                          UnitNames(ElecUnitCount) = EntryName
                          
                          PrepaidElecInstalled(ElecUnitCount) = PrepaidCheck
                          
                          ElecThisReadings(ElecUnitCount) = CDbl(ThisReading)
                          ElecPrevReadings(ElecUnitCount) = CDbl(PrevReading)
                          ElecUnitCons(ElecUnitCount) = Consumption
                          ElecUnitTotCon = ElecUnitTotCon + Consumption
                          
                          If Code = "** " Then ExCount = ExCount + 1
                                                    
                    End If
                      
                    If ThisUtility = "WATER" Then
                        WaterUnitCount = WaterUnitCount + 1
                        If PrepaidCheck = "" Then
                            PrepaidWaterInstalled(WaterUnitCount) = 0
                        Else
                            PrepaidWaterInstalled(WaterUnitCount) = PrepaidCheck
                        End If
                    
                        WaterThisReadings(WaterUnitCount) = ThisReading
                        WaterPrevReadings(WaterUnitCount) = PrevReading
                        WaterUnitCons(WaterUnitCount) = Consumption
                        WaterUnitTotCon = WaterUnitTotCon + Consumption
            
                    End If
            
                 End If
           End If
    
                   
        Index = Index + 1
        ThisCell = UCase(Cells(Index, 1))  ' Reads the next line down the list
    Wend
        LastDataRow = Index
        TotalUnitCount = ElecUnitCount '  Sets the number of units in the building
        ChargeableUnitCount = TotalUnitCount - ExCount
        
        ElecActualTotCon = ElecBulkTotCon - ElecUnitTotCon    ' Calculates ELECTRICITY COMMON PROP  by Subtracting the BULK Total from the UNITS total
        If ElecActualTotCon < 0 Then ElecActualTotCon = 0       ' If the Result is NEGATIVE then no charge is allocated to COMMON PROP
        
        WaterActualTotCon = WaterBulkTotCon - WaterUnitTotCon  ' Calculates WATER COMMON PROP  by Subtracting the BULK Total from the UNITS total
        If WaterActualTotCon < 0 Then WaterActualTotCon = 0       ' If the Result is NEGATIVE then no charge is allocated to COMMON PROP
        
' *****************************************************************************************************************
' Step 1
 'james   CalcSharedAmounts
    Load_Building_Data = True
    
    Exit Function
ErrorFound:
    Load_Building_Data = False
    MsgBox ("Please check the " & ThisUtility & " data for errors")
    Load_Building_Data = False

SkipOut:   '  This is to jump out of the SUB, should there be an error
    Load_Building_Data = False

End Function

Public Sub CalcSharedAmounts()

' On Error GoTo CheckRegion
 
     OptionAmount1 = Sheets(SheetName).Cells(4, SelCol)              ' Get the SET AMOUNT that will be shared
     OptionAmount2 = Sheets(SheetName).Cells(5, SelCol)
     OptionAmount3 = Sheets(SheetName).Cells(6, SelCol)
     OptionAmount4 = Sheets(SheetName).Cells(7, SelCol)
     OptionAmount5 = Sheets(SheetName).Cells(8, SelCol)
     OptionAmount6 = Sheets(SheetName).Cells(9, SelCol)
     OptionAmount7 = Sheets(SheetName).Cells(10, SelCol)
     OptionAmount8 = Sheets(SheetName).Cells(11, SelCol)
  
    ' On Error GoTo 0
    ' Load Charges based on Total number of Units AND how the how charges should be split: PQ or Even
    CalcElecDifferenceBulkVsUnit
    CalcWaterDifferenceBulkVsUnit
     
 ' --- ELECTRICITY ----------------------------------------------------------------------------------------
    SanTot = 0
    For i = 1 To ChargeableUnitCount
        PQ = PercentageQuotes(i)
        
        Select Case UCase(OptionChoice1)
            Case "EVEN": ElecBulkDiff(i) = ((ElecDifference + OptionAmount1) / ChargeableUnitCount)
            Case "PQ": ElecBulkDiff(i) = ((ElecDifference + OptionAmount1) * CDbl(PQ / 100))
            Case "FIXED": ElecBulkDiff(i) = OptionAmount1
            Case "NONE": ElecBulkDiff(i) = 0
        End Select
 
        Select Case UCase(OptionChoice2)
            Case "EVEN": OptionCharge2(i) = (OptionAmount2 / ChargeableUnitCount)
            Case "PQ": OptionCharge2(i) = (OptionAmount2 * CDbl(PQ / 100))
            Case "FIXED": OptionCharge2(i) = OptionAmount2
            Case "NONE": OptionCharge2(i) = 0
        End Select
 
        Select Case UCase(OptionChoice3)
            Case "EVEN": OptionCharge3(i) = (OptionAmount3 / ChargeableUnitCount)
            Case "PQ": OptionCharge3(i) = (OptionAmount3 * CDbl(PQ / 100))
            Case "FIXED": OptionCharge3(i) = OptionAmount3
            Case "NONE": OptionCharge3(i) = 0
        End Select
 
        Select Case UCase(OptionChoice4)
            Case "EVEN": WaterBulkDiff(i) = ((WaterDifference + OptionAmount4) / ChargeableUnitCount)
            Case "PQ": WaterBulkDiff(i) = ((WaterDifference + OptionAmount4) * CDbl(PQ / 100))
            Case "FIXED": WaterBulkDiff(i) = OptionAmount4
            Case "NONE": WaterBulkDiff(i) = 0
        End Select
 
        Select Case UCase(OptionChoice5)
            Case "EVEN": OptionCharge5(i) = (OptionAmount5 / ChargeableUnitCount)
            Case "PQ": OptionCharge5(i) = (OptionAmount5 * CDbl(PQ / 100))
            Case "FIXED": OptionCharge5(i) = OptionAmount5
            Case "NONE": OptionCharge5(i) = 0
        End Select
 
        Select Case UCase(OptionChoice6)
            Case "EVEN": OptionCharge6(i) = (OptionAmount6 / ChargeableUnitCount)
            Case "PQ": OptionCharge6(i) = (OptionAmount6 * CDbl(PQ / 100))
            Case "FIXED": OptionCharge6(i) = OptionAmount6
            Case "NONE": OptionCharge6(i) = 0
        End Select
 
        Select Case UCase(OptionChoice7)
            Case "EVEN": OptionCharge7(i) = (OptionAmount7 / ChargeableUnitCount)
            Case "PQ": OptionCharge7(i) = (OptionAmount7 * CDbl(PQ / 100))
            Case "FIXED": OptionCharge7(i) = OptionAmount7
            Case "NONE": OptionCharge7(i) = 0
            Case "SANWATER": OptionCharge7(i) = OptionAmount7 + GetSanCostsNew(WaterUnitCons(i), 1)
            SanTot = SanTot + OptionCharge7(i)
        End Select
 
        Select Case UCase(OptionChoice8)
            Case "EVEN": OptionCharge8(i) = (OptionAmount8 / ChargeableUnitCount)
            Case "PQ": OptionCharge8(i) = (OptionAmount8 * CDbl(PQ / 100))
            Case "FIXED": OptionCharge8(i) = OptionAmount8
            Case "NONE": OptionCharge8(i) = 0
        End Select

    Next
    
    Exit Sub
    
CheckRegion:
    MsgBox ("Regional Settings are set incorrectly")
    
End Sub

Sub CalcElecDifferenceBulkVsUnit()

     '  ElecActualTotCon = ElecBulkTotCon - ElecUnitTotCon
  'lll
    If NewCalc = True Then  ' ##########################
        ElecBulkTotCharge = GetElecCostsNew(ElecBulkTotCon, TotalUnitCount)
        
        ElecBulkTariffU1 = ElecTariffUnits1:        ElecBulkTariffC1 = ElecTariffCost1
        ElecBulkTariffU2 = ElecTariffUnits2:        ElecBulkTariffC2 = ElecTariffCost2
        ElecBulkTariffU3 = ElecTariffUnits3:        ElecBulkTariffC3 = ElecTariffCost3
        ElecBulkTariffU4 = ElecTariffUnits4:        ElecBulkTariffC4 = ElecTariffCost4
        ElecBulkTariffU5 = ElecTariffUnits5:        ElecBulkTariffC5 = ElecTariffCost5
        ElecBulkTariffU6 = ElecTariffUnits6:        ElecBulkTariffC6 = ElecTariffCost6
        ElecBulkTariffU7 = ElecTariffUnits7:        ElecBulkTariffC7 = ElecTariffCost7
        ElecBulkTariffU8 = ElecTariffUnits8:        ElecBulkTariffC8 = ElecTariffCost8

        
    Else
        ElecBulkTotCharge = GetElecCosts(ElecBulkTotCon, TotalUnitCount)
             
        ElecBulkTariffU1 = ElecTariffUnits1:        ElecBulkTariffC1 = ElecTariffCost1
        ElecBulkTariffU2 = ElecTariffUnits2:        ElecBulkTariffC2 = ElecTariffCost2
        ElecBulkTariffU3 = ElecTariffUnits3:        ElecBulkTariffC3 = ElecTariffCost3
        ElecBulkTariffU4 = ElecTariffUnits4:        ElecBulkTariffC4 = ElecTariffCost4
        ElecBulkTariffU5 = ElecTariffUnits5:        ElecBulkTariffC5 = ElecTariffCost5
        ElecBulkTariffU6 = ElecTariffUnits6:        ElecBulkTariffC6 = ElecTariffCost6
        ElecBulkTariffU7 = ElecTariffUnits7:        ElecBulkTariffC7 = ElecTariffCost7
        ElecBulkTariffU8 = ElecTariffUnits8:        ElecBulkTariffC8 = ElecTariffCost8

    End If
           
    If NewCalc = True Then  ' ##########################
        ElecUnitTotCharge = GetElecCostsNew(ElecUnitTotCon, TotalUnitCount)
    Else
        ElecUnitTotCharge = GetElecCosts(ElecUnitTotCon, TotalUnitCount)
    End If
        
       ' ElecUnitTotCharge = GetElecCostsNew(ElecUnitTotCon, TotalUnitCount)
        
        ElecUnitTariffU1 = ElecTariffUnits1:        ElecUnitTariffC1 = ElecTariffCost1
        ElecUnitTariffU2 = ElecTariffUnits2:        ElecUnitTariffC2 = ElecTariffCost2
        ElecUnitTariffU3 = ElecTariffUnits3:        ElecUnitTariffC3 = ElecTariffCost3
        ElecUnitTariffU4 = ElecTariffUnits4:        ElecUnitTariffC4 = ElecTariffCost4
        ElecUnitTariffU5 = ElecTariffUnits5:        ElecUnitTariffC5 = ElecTariffCost5
        ElecUnitTariffU6 = ElecTariffUnits6:        ElecUnitTariffC6 = ElecTariffCost6
        ElecUnitTariffU7 = ElecTariffUnits7:        ElecUnitTariffC7 = ElecTariffCost7
        ElecUnitTariffU8 = ElecTariffUnits8:        ElecUnitTariffC8 = ElecTariffCost8
 
      ElecDifference = ElecBulkTotCharge - ElecActualTotCharge
     
End Sub

Sub CalcWaterDifferenceBulkVsUnit()

    ''    WaterActualTotCon = WaterBulkTotCon - WaterUnitTotCon   '''''''''''''''''''''''temp
        
    
     '   WaterBulkTotCharge = GetWaterCostsNew(WaterBulkTotCon, TotalUnitCount)
        If NewCalc = True Then  ' ##########################
            WaterBulkTotCharge = GetWaterCostsNew(WaterBulkTotCon, TotalUnitCount)
        Else
            WaterBulkTotCharge = GetWaterCosts(WaterBulkTotCon, TotalUnitCount)
        End If
    
        WaterBulkTariffU1 = WaterTariffUnits1:        WaterBulkTariffC1 = WaterTariffCost1
        WaterBulkTariffU2 = WaterTariffUnits2:        WaterBulkTariffC2 = WaterTariffCost2
        WaterBulkTariffU3 = WaterTariffUnits3:        WaterBulkTariffC3 = WaterTariffCost3
        WaterBulkTariffU4 = WaterTariffUnits4:        WaterBulkTariffC4 = WaterTariffCost4
        WaterBulkTariffU5 = WaterTariffUnits5:        WaterBulkTariffC5 = WaterTariffCost5
        WaterBulkTariffU6 = WaterTariffUnits6:        WaterBulkTariffC6 = WaterTariffCost6
        WaterBulkTariffU7 = WaterTariffUnits7:        WaterBulkTariffC7 = WaterTariffCost7
        WaterBulkTariffU8 = WaterTariffUnits8:        WaterBulkTariffC8 = WaterTariffCost8
        
        If NewCalc = True Then  ' ##########################
            WaterUnitTotCharge = GetWaterCostsNew(WaterUnitTotCon, TotalUnitCount)
        Else
            WaterUnitTotCharge = GetWaterCosts(WaterUnitTotCon, TotalUnitCount)
        End If
        'WaterUnitTotCharge = GetWaterCostsNew(WaterUnitTotCon, TotalUnitCount)
        
        WaterUnitTariffU1 = WaterTariffUnits1:        WaterUnitTariffC1 = WaterTariffCost1
        WaterUnitTariffU2 = WaterTariffUnits2:        WaterUnitTariffC2 = WaterTariffCost2
        WaterUnitTariffU3 = WaterTariffUnits3:        WaterUnitTariffC3 = WaterTariffCost3
        WaterUnitTariffU4 = WaterTariffUnits4:        WaterUnitTariffC4 = WaterTariffCost4
        WaterUnitTariffU5 = WaterTariffUnits5:        WaterUnitTariffC5 = WaterTariffCost5
        WaterUnitTariffU6 = WaterTariffUnits6:        WaterUnitTariffC6 = WaterTariffCost6
        WaterUnitTariffU7 = WaterTariffUnits7:        WaterUnitTariffC7 = WaterTariffCost7
        WaterUnitTariffU8 = WaterTariffUnits8:        WaterUnitTariffC8 = WaterTariffCost8
             
     ''   WaterDifference = WaterBulkTotCharge - WaterUnitTotCharge
        
   WaterDifference = WaterBulkTotCharge - WaterActualTotCharge
   
   '    RemWaterDiff = Format(WaterDifference, "#.00")
   '    If IgnoreNegComP = True Then If WaterDifference < 0 Then WaterDifference = 0
        
End Sub

 
Function GetConsumption(ThisReading As Double, PrevReading As Double) As Double

    ThisLen = Len(Str(ThisReading))
    PrevLen = Len(Str(PrevReading))
    FirstNum = Mid(PrevReading, 1, 1)

    If ThisLen < PrevLen And FirstNum = "9" Then
        GetConsumption = CDbl(ThisReading) - CDbl(PrevReading) + 10 ^ (PrevLen - 1)
    Else
        GetConsumption = CDbl(ThisReading) - CDbl(PrevReading)
    End If

End Function




